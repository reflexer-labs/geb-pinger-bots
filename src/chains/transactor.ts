import Axios from 'axios'
import { BigNumber, ethers } from 'ethers'
import {
  TransactionRequest,
  utils,
  Geb,
  BaseContractAPI,
  GebContractAPIConstructorInterface,
} from 'geb.js'
import { notifier } from '..'

export class Transactor {
  private provider: ethers.providers.Provider
  private signer?: ethers.Signer
  constructor(signerOrProvider: ethers.Signer | ethers.providers.Provider) {
    if (ethers.Wallet.isSigner(signerOrProvider)) {
      this.signer = signerOrProvider

      if (!this.signer.provider) {
        throw new Error('The signer needs a provider')
      }

      this.provider = this.signer.provider
    } else {
      this.provider = signerOrProvider
    }
  }

  public async ethCall(tx: TransactionRequest): Promise<string> {
    try {
      return await this.provider.call(tx)
    } catch (err) {
      // Try decoding the error before throw
      let decodedErr: string | null
      try {
        decodedErr = utils.getRequireString(err)
      } catch {
        throw err
      }

      throw decodedErr
    }
  }

  public async ethSend(tx: TransactionRequest, gasLimit?: BigNumber): Promise<string> {
    if (!this.signer) {
      throw new Error("The transactor can't sign transactions, provide a signer")
    }

    // Take care of gas limit
    if (!gasLimit) {
      try {
        gasLimit = (await this.signer.estimateGas(tx)).add(100000)
      } catch (err) {
        if (err.code === 'NETWORK_ERROR') {
          throw err
        }

        let message = 'Transaction revert at gas estimation'

        // Try to fetch the error message with a call
        try {
          await this.ethCall(tx)
        } catch (err) {
          if (typeof err === 'string') {
            message += ': ' + err
          }
        }

        await notifier.sendError(message)
        throw Error(message)
      }
    }

    tx.gasLimit = gasLimit

    // Try fetching gas price from gasnow.org or use node default
    try {
      tx.gasPrice = await this.gasNowPriceAPI()
      console.log('D')
    } catch {}

    // Send transaction
    let response: ethers.providers.TransactionResponse
    try {
      response = await this.signer.sendTransaction(tx)
      console.log('E')
      return response.hash
    } catch (err) {
      const errorMessage = err.reason || JSON.stringify(err)
      await notifier.sendError(`Error send transaction: ${errorMessage}`)
      throw errorMessage
    }
  }

  public async getNonce(address: string) {
    return this.provider.getTransactionCount(address)
  }

  public async getBalance(address: string) {
    return this.provider.getBalance(address)
  }

  public async getLatestBlockTimestamp() {
    return (await this.provider.getBlock('latest')).timestamp
  }

  public async getBlockNumber() {
    return this.provider.getBlockNumber()
  }

  public async getNetworkName() {
    let networkName = (await this.provider.getNetwork()).name

    if (networkName === 'homestead') {
      networkName = 'mainnet'
    }

    return networkName
  }

  public async getWalletAddress() {
    if (!this.signer) {
      throw new Error("The transactor can't sign transactions, provide a signer")
    }

    return this.signer.getAddress()
  }

  public async callContractFunciton(abi: string, address: string, params?: any[]) {
    const contract = new ethers.Contract(address, [abi], this.provider)
    const functionName = abi.split(' ')[1].split('(')[0]

    if (params) {
      return await contract[functionName](params)
    } else {
      return await contract[functionName]()
    }
  }

  public async getContractEvents(abi: string, address: string, fromBlock: number, toBlock: number) {
    const contract = new ethers.Contract(address, [abi], this.provider)
    const filterName = abi.split(' ')[1].split('(')[0]
    const filter = contract.filters[filterName]()
    let events = await contract.queryFilter(filter, fromBlock, toBlock)

    return events
  }

  public getGebContract<T extends BaseContractAPI>(
    gebContractClass: GebContractAPIConstructorInterface<T>,
    address: string
  ): T {
    return Geb.getGebContract(gebContractClass, address, this.provider)
  }

  private async gasNowPriceAPI() {
    const url = 'https://www.gasnow.org/api/v3/gas/price?utm_source=:RFX'
    const resp = await Axios.get(url)
    return resp.data.data.standard
  }
}
