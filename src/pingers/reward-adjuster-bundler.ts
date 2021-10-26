import { TransactionRequest } from '@reflexer-finance/geb-admin'
import { ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { SETTER_GAS_500K } from '../utils/constants'

export class RewardAdjusterBundlerPinger {
  protected transactor: Transactor

  constructor(private pingerAddress: string, wallet: ethers.Signer) {
    this.transactor = new Transactor(wallet)
  }

  public async ping() {
    let tx: TransactionRequest

    const contract = new ethers.Contract(this.pingerAddress, [
      'function recomputeAllRewards() external',
    ])
    // Simulate the call
    try {
      tx = contract.recomputeAllRewards()
      await this.transactor.ethCall(tx)
    } catch (err) {
      await notifier.sendError(`Unknown error while simulating call: ${err}`)
      return
    }

    // Send the transaction
    const hash = await this.transactor.ethSend(tx, true, SETTER_GAS_500K)
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
