import { adminContracts, TransactionRequest } from '@reflexer-finance/geb-admin'
import { ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { CEILING_SETTER_AUTO_UPDATE_CEILING } from '../utils/constants'
import { now } from '../utils/time'

export class CeilingSetter {
  protected ceilingSetter: adminContracts.SingleSpotDebtCeilingSetter
  protected transactor: Transactor

  constructor(
    ceilingSetterAddress: string,
    wallet: ethers.Signer,
    protected rewardReceiver: string,
    private minUpdateInterval
  ) {
    this.transactor = new Transactor(wallet)
    this.ceilingSetter = this.transactor.getGebContract(
      adminContracts.SingleSpotDebtCeilingSetter,
      ceilingSetterAddress
    )
  }

  public async ping() {
    let tx: TransactionRequest

    // Check if it's too early to update
    const lastUpdatedTime = await this.ceilingSetter.lastUpdateTime()
    if (now().sub(lastUpdatedTime).lt(this.minUpdateInterval)) {
      // To early to update but still check if there a pending transaction.
      // If yes continue the execution that will bump the gas price.
      if (!(await this.transactor.isAnyTransactionPending())) {
        console.log('To early to update')
        return
      }
    }

    // Send the caller reward to a specified address or send the reward to the pinger bot
    let rewardReceiver =
      !this.rewardReceiver || this.rewardReceiver === ''
        ? await this.transactor.getWalletAddress()
        : this.rewardReceiver

    // Simulate the call
    try {
      tx = this.ceilingSetter.autoUpdateCeiling(rewardReceiver)
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('SingleSpotDebtCeilingSetter/wait-more')) {
        console.log('Ceiling setter can not yet be executed')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send the transaction
    const hash = await this.transactor.ethSend(tx, true, CEILING_SETTER_AUTO_UPDATE_CEILING)
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
