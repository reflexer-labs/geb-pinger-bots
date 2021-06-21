import { adminContracts, TransactionRequest } from '@reflexer-finance/geb-admin'
import { ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { GEB_DEBT_FLOOR_ADJUSTER__RECOMPUTE_COLLATERAL_DEBT_FLOOR } from '../utils/constants'
import { now } from '../utils/time'

export class DebtFloorAdjuster {
  protected adjuster: adminContracts.SingleDebtFloorAdjuster
  protected transactor: Transactor

  constructor(
    adjusterAddress: string,
    wallet: ethers.Signer,
    protected rewardReceiver: string,
    private minUpdateInterval
  ) {
    this.transactor = new Transactor(wallet)
    this.adjuster = this.transactor.getGebContract(
      adminContracts.SingleDebtFloorAdjuster,
      adjusterAddress
    )
  }

  public async ping() {
    // Check if it's too early to update
    const lastUpdatedTime = await this.adjuster.lastUpdateTime()
    if (now().sub(lastUpdatedTime).lt(this.minUpdateInterval)) {
      // To early to update but still check if there a pending transaction.
      // If yes continue the execution that will bump the gas price.
      if (!(await this.transactor.isAnyTransactionPending())) {
        console.log('To early to update')
        return
      }
    }

    // Send the caller reward to specified address or send the reward to the pinger bot
    let rewardReceiver =
      !this.rewardReceiver || this.rewardReceiver === ''
        ? await this.transactor.getWalletAddress()
        : this.rewardReceiver

    // Simulate call
    let tx: TransactionRequest
    try {
      tx = this.adjuster.recomputeCollateralDebtFloor(rewardReceiver)
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('SingleDebtFloorAdjuster/wait-more')) {
        console.log('SingleDebtFloorAdjuster, wait more')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send transaction
    const hash = await this.transactor.ethSend(
      tx,
      true,
      GEB_DEBT_FLOOR_ADJUSTER__RECOMPUTE_COLLATERAL_DEBT_FLOOR
    )
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
