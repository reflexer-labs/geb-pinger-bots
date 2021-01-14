import { BigNumber, ethers } from 'ethers'
import { contracts, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { now } from '../utils/time'

export class RateSetterPinger {
  private rateSetter: contracts.RateSetter
  private transactor: Transactor
  constructor(
    rateSetterAddress: string,
    protected rewardReceiver: string,
    wallet: ethers.Signer,
    protected minUpdateInterval
  ) {
    this.transactor = new Transactor(wallet)
    this.rateSetter = this.transactor.getGebContract(contracts.RateSetter, rateSetterAddress)
  }

  public async ping() {
    let tx: TransactionRequest
    let isAnyTransactionPending = await this.transactor.isAnyTransactionPending()

    const lastUpdatedTimeRateSetter = await this.rateSetter.lastUpdateTime()
    if (
      now().sub(lastUpdatedTimeRateSetter).gte(this.minUpdateInterval) ||
      isAnyTransactionPending
    ) {
      try {
        tx = this.rateSetter.updateRate(this.rewardReceiver)

        // Simulate transaction to check if there are any expected errors
        await this.transactor.ethCall(tx)

        // Send oracle relayer transaction
        // We force overwrite unless we just updated the FSM.
        const hash = await await this.transactor.ethSend(tx, true, BigNumber.from('400000'))
        console.log(`Rate setter update sent, transaction hash: ${hash}`)
      } catch (err) {
        if (typeof err == 'string' && err.startsWith('RateSetter/wait-more')) {
          // Rate setter was updated too recently, wait more.
          console.log('Rate setter not yet ready to be updated')
        } else {
          await notifier.sendError(`Unexpected error while simulating call: ${err}`)
        }
      }
    } else {
      console.log('To early to update rateSetter')
    }
  }
}
