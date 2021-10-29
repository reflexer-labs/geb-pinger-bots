import { TransactionRequest } from '@reflexer-finance/geb-admin'
import { ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { SETTER_GAS_500K } from '../utils/constants'

export class RewardAdjusterBundlerPinger {
  protected transactor: Transactor

  constructor(private pingerAddress: string, private wallet: ethers.Signer) {
    if (!wallet.provider) {
      throw new Error('The signer needs a provider')
    }

    this.transactor = new Transactor(wallet)
  }

  public async ping() {
    let tx: TransactionRequest

    const contract = new ethers.Contract(
      this.pingerAddress,
      ['function recomputeAllRewards() external'],
      this.wallet.provider
    )
    // Simulate the call
    try {
      tx = await contract.populateTransaction.recomputeAllRewards()
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
