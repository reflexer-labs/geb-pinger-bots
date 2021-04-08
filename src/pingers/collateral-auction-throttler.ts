import { adminContracts, TransactionRequest } from '@reflexer-finance/geb-admin'
import { ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { COLLATERAL_AUCTION_THROTTLER__RECOMPUTE_ON_AUCTION_SYSTEM_COIN_LIMIT_GAS } from '../utils/constants'
import { now } from '../utils/time'

export class CollateralAuctionThrottler {
  protected throttler: adminContracts.CollateralAuctionThrottler
  protected transactor: Transactor

  constructor(
    throttlerAddress: string,
    wallet: ethers.Signer,
    protected rewardReceiver: string,
    private minUpdateInterval
  ) {
    this.transactor = new Transactor(wallet)
    this.throttler = this.transactor.getGebContract(
      adminContracts.CollateralAuctionThrottler,
      throttlerAddress
    )
  }

  public async ping() {
    // Check if it's too early to update
    const lastUpdatedTime = await this.throttler.lastUpdateTime()
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
      tx = this.throttler.recomputeOnAuctionSystemCoinLimit(rewardReceiver)
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('CollateralAuctionThrottler/wait-more')) {
        console.log('Collateral Auction Throttler cannot yet be executed')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send transaction
    const hash = await this.transactor.ethSend(
      tx,
      true,
      COLLATERAL_AUCTION_THROTTLER__RECOMPUTE_ON_AUCTION_SYSTEM_COIN_LIMIT_GAS
    )
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
