import { adminContracts, TransactionRequest } from '@reflexer-finance/geb-admin'
import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'

export class CeilingSetter {
  protected ceilingSetter: adminContracts.SingleSpotDebtCeilingSetter
  protected transactor: Transactor

  constructor(
    ceilingSetterAddress: string,
    wallet: ethers.Signer,
    protected rewardReceiver: string
  ) {
    this.transactor = new Transactor(wallet)
    this.ceilingSetter = this.transactor.getGebContract(
      adminContracts.SingleSpotDebtCeilingSetter,
      ceilingSetterAddress
    )
  }

  public async ping() {
    let tx: TransactionRequest

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
    const hash = await this.transactor.ethSend(tx, true, BigNumber.from('500000'))
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
