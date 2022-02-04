import axios from 'axios'
import { BigNumber, ethers } from 'ethers'
import { utils, Geb, BaseContractAPI, GebContractAPIConstructorInterface } from 'geb.js'
import { notifier } from '..'
import {
  ETH_NODE_STALL_SYNC_TIMEOUT,
  GAS_ESTIMATE_BUFFER,
  PENDING_TRANSACTION_GAS_BUMP_PERCENT,
  RPC_FAILED_TIMEOUT,
} from '../utils/constants'

export class Transactor {
  public provider: ethers.providers.Provider
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

  public async ethCall(tx: ethers.providers.TransactionRequest): Promise<any> {
    try {
      const res = await this.provider.call(tx)

      // Some backend returns the require string when doing an eth call
      // The function below detects if there is any require error.
      // If there is, we throw an error
      if (utils.getRequireString(res)) {
        throw res
      }

      return res
    } catch (err) {
      // Try to decode the error before throwing
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
    tx: ethers.providers.TransactionRequest,
    // If set to true, the current confirmed nonce will be used and potentially override pending transactions
    forceOverride: boolean,
    gasLimit?: BigNumber
  ): Promise<string> {
    // Sanity checks
    if (!this.signer) {
      throw new Error("The transactor can't sign transactions, need to provide a signer")
    }

    if (!tx.to) {
      throw 'Incomplete transaction'
    }

    // == Gas limit ==
    if (!gasLimit) {
      try {
        gasLimit = (await this.signer.estimateGas(tx)).add(GAS_ESTIMATE_BUFFER)
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

    try {
      const { maxFeePerGas, maxPriorityFeePerGas } = await this.blockNativeGasPrice(80)
      tx.maxFeePerGas = maxFeePerGas
      tx.maxPriorityFeePerGas = maxPriorityFeePerGas
    } catch {
      tx = await this.signer.populateTransaction(tx)
    } finally {
      if (!tx.gasPrice && !(tx.maxFeePerGas && tx.maxPriorityFeePerGas)) {
        const err = 'Could not determine the gas price'
        await notifier.sendError(err)
        throw err
      }
    }

    const bumpGasPrice = async (tx: ethers.providers.TransactionRequest) => {
      if (!tx.gasPrice || !(tx.maxFeePerGas && tx.maxPriorityFeePerGas)) {
        throw Error('Undefined gas price to bump')
      }

      await notifier.sendError(
        `Potential pending transaction from previous run (pending nonce: ${pendingNonce}, current nonce: ${currentNonce}). Keep calm and override transaction with current gas price + ${PENDING_TRANSACTION_GAS_BUMP_PERCENT}%`
      )
      // Add 30% gas price

      if (tx.gasPrice) {
        tx.gasPrice = BigNumber.from(tx.gasPrice)
          .mul(PENDING_TRANSACTION_GAS_BUMP_PERCENT + 100)
          .div(100)
      } else {
        tx.maxFeePerGas = BigNumber.from(tx.maxFeePerGas)
          .mul(PENDING_TRANSACTION_GAS_BUMP_PERCENT + 100)
          .div(100)
        tx.maxPriorityFeePerGas = BigNumber.from(tx.maxPriorityFeePerGas)
          .mul(PENDING_TRANSACTION_GAS_BUMP_PERCENT + 100)
          .div(100)
      }
    }

    // == Nonce ==

    // Set the proper nonce, detect pending transactions
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
      // If we override a transaction, bump the gas price
      if (pendingNonce > currentNonce) {
        await bumpGasPrice(tx)
      }

      // This will make sure to override any pending transaction
      tx.nonce = currentNonce
      this.nonce = currentNonce
    } else {
      // The transaction should be executed after the previous one
      if (this.nonce !== null) {
        // We already submitted a transaction within the same execution window (piped txs like FSM + Oracle relayer)
        this.nonce += 1
        tx.nonce = this.nonce

        // If there's already a pending tx with the same nonce for the action we want to do, we need to bump the gas price
        if (pendingNonce > this.nonce) {
          await bumpGasPrice(tx)
        }
      } else {
        // The transaction should be queued even if the current run did not override any prior transaction
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

    // == Send a transaction ==
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

  // Return whether there is a transaction pending in the mempool
  public async isAnyTransactionPending(address?: string): Promise<boolean> {
    let fromAddress: string

    // Use the optional address passed or the address from the signer (if we have one)
    if (address) {
      fromAddress = address
    } else {
      // Sanity checks
      if (!this.signer) {
        throw new Error("The transactor can't sign transactions, must provide a signer")
      }
      fromAddress = await this.signer.getAddress()
    }

    const currentNonce = await this.provider.getTransactionCount(fromAddress, 'latest')
    const pendingNonce = await this.provider.getTransactionCount(fromAddress, 'pending')

    if (pendingNonce < currentNonce) {
      // This should never be the case unless we have some serious bugs on the ETH node
      await notifier.sendError(
        `Bad Ethereum node. Pending nonce: ${pendingNonce}, current nonce: ${currentNonce}`
      )

      return false
    } else if (pendingNonce > currentNonce) {
      // There is a pending transaction in the mempool!
      return true
    } else {
      // currentNonce = pendingNonce
      return false
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
      throw new Error("The transactor can't sign transactions, must provide a signer")
    }

    return this.signer.getAddress()
  }

  public async callContractFunciton(abi: string, address: string, params?: any[]) {
    const contract = new ethers.Contract(address, [abi], this.provider)
    const functionName = abi.split(' ')[1].split('(')[0]

    if (params) {
      return await contract[functionName](...params)
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

  private async blockNativeGasPrice(nextBlockConfidence: 70 | 80 | 90 | 95 | 99): Promise<{
    price: BigNumber
    maxPriorityFeePerGas: BigNumber
    maxFeePerGas: BigNumber
  }> {
    if (!process.env.BLOCKNATIVE_API_KEY) {
      throw Error('No blocknative key')
    }

    const url = 'https://api.blocknative.com/gasprices/blockprices'
    const resp = await axios.get(url, {
      headers: {
        Authorization: process.env.BLOCKNATIVE_API_KEY,
      },
    })
    const match = resp.data.blockPrices[0].estimatedPrices.find(
      (x: any) => x.confidence === nextBlockConfidence
    )

    const e9 = '000000000'
    if (match) {
      console.log(match)
      return {
        price: BigNumber.from(match.price + e9),
        maxFeePerGas: BigNumber.from(match.maxFeePerGas + e9),
        maxPriorityFeePerGas: BigNumber.from(match.maxPriorityFeePerGas + e9),
      }
    } else {
      throw Error('Blocknative broken API')
    }
  }

  public async checkNodes() {
    const fallbackProvider = this.provider as ethers.providers.FallbackProvider
    const currentTime = Date.now() / 1000

    // Use a timeout for the node
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
        latestBlock = await Promise.race([
          provider.getBlock('latest'),
          promiseTimeout(RPC_FAILED_TIMEOUT),
        ])
      } catch (err) {
        console.log(err)
        notifier.sendError(
          `Ethereum node at ${provider.connection.url} responded with an error: ${JSON.stringify(
            err.message || err
          )}`
        )
        continue
      }

      if (currentTime - latestBlock.timestamp > ETH_NODE_STALL_SYNC_TIMEOUT) {
        notifier.sendError(
          `Ethereum node at ${provider.connection.url} is out of sync. Latest block more than 5 minutes old.`
        )
      }
    }

    return true
  }
}
