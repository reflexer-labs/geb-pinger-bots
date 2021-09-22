import { adminContracts, TransactionRequest } from '@reflexer-finance/geb-admin'
import { ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { SETTER_GAS_500K } from '../utils/constants'
import { now } from '../utils/time'

export class StakeRewardRefill {
  protected refiller: adminContracts.StakeRewardRefill
  protected transactor: Transactor

  constructor(setterAddress: string, wallet: ethers.Signer, private minUpdateInterval) {
    this.transactor = new Transactor(wallet)
    this.refiller = this.transactor.getGebContract(adminContracts.StakeRewardRefill, setterAddress)
  }

  public async ping() {
    // Check if it's too early to update
    const lastUpdatedTime = await this.refiller.lastRefillTime()
    if (now().sub(lastUpdatedTime).lt(this.minUpdateInterval)) {
      // To early to update but still check if there a pending transaction.
      // If yes continue the execution that will bump the gas price.
      if (!(await this.transactor.isAnyTransactionPending())) {
        console.log('To early to update')
        return
      }
    }

    // Simulate call
    let tx: TransactionRequest
    try {
      tx = this.refiller.refill()
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('StakeRewardRefill/wait-more')) {
        console.log('StakeRewardRefill, wait more')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send transaction
    const hash = await this.transactor.ethSend(tx, true, SETTER_GAS_500K)
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
