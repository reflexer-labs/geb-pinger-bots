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
  private nonce: number | null = null
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

  public async ethCall(tx: TransactionRequest): Promise<any> {
    try {
      const res = await this.provider.call(tx)

      // Some backend returns the require string when doing an eth call
      // The function below detects if there it's a require error.
      // If it is, we throw a pass the processing below
      if (utils.getRequireString(res)) {
        throw res
      }

      return res
    } catch (err) {
      // Try decoding the error before throw
      let decodedErr: string | null
      try {
        decodedErr = utils.getRequireString(err)
      } catch {
        throw err
      }

      throw decodedErr ? decodedErr : err
    }
  }

  public async ethSend(
    tx: TransactionRequest,
    // If set to true, the current confirmed nonce will be used and potentially overridePending transactions
    forceOverride: boolean,
    gasLimit?: BigNumber
  ): Promise<string> {
    // Sanity checks
    if (!this.signer) {
      throw new Error("The transactor can't sign transactions, provide a signer")
    }

    if (!tx.to) {
      throw 'Incomplete transaction'
    }

    // == Gas limit ==
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

    // == Gas Price ==

    //Try fetching gas price from gasnow.org or use node default
    try {
      tx.gasPrice = BigNumber.from(await this.gasNowPriceAPI())
    } catch {
      tx.gasPrice = await this.provider.getGasPrice()
    } finally {
      if (!BigNumber.isBigNumber(tx.gasPrice)) {
        const err = 'Could not determine  gas price'
        await notifier.sendError(err)
        throw err
      }
      // tx.gasPrice
    }

    // == Nonce ==

    // Set proper nonce, detect pending transactions
    const fromAddress = await this.signer.getAddress()
    const currentNonce = await this.provider.getTransactionCount(fromAddress, 'latest')
    const pendingNonce = await this.provider.getTransactionCount(fromAddress, 'pending')

    if (pendingNonce < currentNonce) {
      // This should never be the case unless we have some serious bugs on the ETH node
      await notifier.sendError(
        `Bad Ethereum node: pending nonce: ${pendingNonce}, current nonce: ${currentNonce}`
      )
    }

    if (forceOverride) {
      if (pendingNonce > currentNonce) {
        // There is a pending transaction in the mempool!
        await notifier.sendError(
          `Potential pending transaction from previous run (pending nonce: ${pendingNonce}, current nonce: ${currentNonce}). Keep calm and override transaction with current gas price + 30%`
        )

        // Add 30% gas price
        tx.gasPrice = tx.gasPrice.mul(13).div(10)
      }

      // This will enforce overriding any pending transaction
      tx.nonce = currentNonce
      this.nonce = currentNonce
    } else {
      // The transaction should be executed after a previous one
      if (this.nonce !== null) {
        this.nonce += 1
        tx.nonce = this.nonce
      } else {
        // The transaction should be queued however the current run did not make any prior transaction.

        if (pendingNonce > currentNonce) {
          // There is a pending transaction in the mempool!
          await notifier.sendError(
            `Potential pending transaction from previous run (pending nonce: ${pendingNonce}, current nonce: ${currentNonce}). NOT OVERRIDING WITH HIGHER GAS PRICE!!`
          )
        }

        tx.nonce = pendingNonce
        this.nonce = pendingNonce
      }
    }

    // == Send transaction ==
    let response: ethers.providers.TransactionResponse
    try {
      response = await this.signer.sendTransaction(tx)
      return response.hash
    } catch (err) {
      const errorMessage = err.reason || JSON.stringify(err)
      await notifier.sendError(`Error send transaction: ${errorMessage}`)
      throw errorMessage
    }
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
    return resp.data.data.fast as string
  }

  public async checkNodes() {
    const fallbackProvider = this.provider as ethers.providers.FallbackProvider
    const currentTime = Date.now() / 1000

    // Use a timeout for the node to respond
    const promiseTimeout = (ms) =>
      new Promise<any>((_, reject) => {
        let id = setTimeout(() => {
          clearTimeout(id)
          reject('Timed out after ' + ms / 1000 + 's.')
        }, ms)
      })

    for (let p of fallbackProvider.providerConfigs) {
      const provider = p.provider as ethers.providers.StaticJsonRpcProvider
      let latestBlock: ethers.providers.Block
      try {
        // Get the latest block with 10 second timeout
        latestBlock = await Promise.race([provider.getBlock('latest'), promiseTimeout(10000)])
      } catch (err) {
        console.log(err)
        notifier.sendError(
          `Ethereum node at ${provider.connection.url} responded with an error: ${JSON.stringify(
            err.message || err
          )}`
        )
        continue
      }

      if (currentTime - latestBlock.timestamp > 300) {
        notifier.sendError(
          `Ethereum node at ${provider.connection.url} is out sync. Latest block more than 5min old.`
        )
      }
    }

    return true
  }
}
