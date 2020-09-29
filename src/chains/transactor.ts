import { BigNumber, ethers } from 'ethers'
import { TransactionRequest, utils } from 'geb.js'
import { notifier } from '..'

export class Transactor {
  constructor(private signer: ethers.Signer) {}

  public async ethCall(tx: TransactionRequest): Promise<string> {
    try {
      return await this.signer.call(tx)
    } catch (err) {
      // Try decoding the error before throw
      let decodedErr: string
      try {
        decodedErr = utils.decodeChainError(err)
      } catch {
        throw err
      }

      throw decodedErr
    }
  }

  public async ethSend(tx: TransactionRequest): Promise<string> {
    // Take care of gas limit
    let gasLimit: BigNumber
    try {
      gasLimit = (await this.signer.estimateGas(tx)).add(100000)
    } catch (err) {
      const message = 'Transaction revert at gas estimation, still try to send it with 500k gas.'
      console.warn(message)
      await notifier.sendAllChannels(message)
      gasLimit = BigNumber.from(500000)
    }
    tx.gasLimit = gasLimit

    // Take care of gas price
    // TODO: Gas APIs

    // Send transaction
    let response: ethers.providers.TransactionResponse
    try {
      response = await this.signer.sendTransaction(tx)
    } catch (err) {
      let errorMessage: any
      try {
        errorMessage = utils.decodeChainError(err)
      } catch (err) {
        errorMessage = err.message ? err.message : err
      }
      throw new Error(`EthSend failure: ${errorMessage}`)
    }

    return response.hash
  }
}
