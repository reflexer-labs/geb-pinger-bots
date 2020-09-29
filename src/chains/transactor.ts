import Axios from 'axios'
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

    // Try fetching gas price from gasnow.org or use node default
    try {
      tx.gasPrice = await this.gasNowPriceAPI()
    } catch {}

    // Send transaction
    let response: ethers.providers.TransactionResponse
    try {
      response = await this.signer.sendTransaction(tx)
      return response.hash
    } catch (err) {
      const errorMessage = err.reason || JSON.stringify(err)
      notifier.sendAllChannels(`Error send transaction: ${errorMessage}`)
      throw errorMessage
    }
  }

  private async gasNowPriceAPI() {
    const url = 'https://www.gasnow.org/api/v3/gas/price?utm_source=:RFX'
    const resp = await Axios.get(url)
    return resp.data.data.fast
  }
}
