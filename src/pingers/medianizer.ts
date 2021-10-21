import { ethers } from 'ethers'
import { contracts, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import {
  CHAINLINK_MEDIANIZER__UPDATE_RESULTS_GAS,
  COIN_MEDIANIZER__UPDATE_RESULTS_GAS,
  RATE_SETTER__UPDATE_RATE_GAS,
} from '../utils/constants'
import { now } from '../utils/time'

export class ChainlinkMedianizerPinger {
  // We use an UniswapMedian contract but it can be a Chainlink median as well
  protected medianizer: contracts.UniswapConsecutiveSlotsMedianRaiusd
  protected transactor: Transactor

  constructor(
    chainlinkMedianizerAddress: string,
    wallet: ethers.Signer,
    protected minUpdateInterval: number,
    protected rewardReceiver: string
  ) {
    this.transactor = new Transactor(wallet)
    this.medianizer = this.transactor.getGebContract(
      contracts.UniswapConsecutiveSlotsMedianRaiusd,
      chainlinkMedianizerAddress
    )
  }

  public async ping() {
    let tx: TransactionRequest

    // Check if it's too early to update
    const lastUpdatedTime = await this.medianizer.lastUpdateTime()
    if (now().sub(lastUpdatedTime).lt(this.minUpdateInterval)) {
      // It's too early to update but still check if there a pending transaction
      // If there is a pending tx, continue the execution so you bump the gas price
      if (!(await this.transactor.isAnyTransactionPending())) {
        console.log('Too early to update')
        return
      } else {
        console.log(
          'Too early to update but there is tx pending so continue the execution in order to bump the gas price'
        )
      }
    }

    // Send the reward to a specified address or send it to the pinger bot
    let rewardReceiver =
      !this.rewardReceiver || this.rewardReceiver === ''
        ? await this.transactor.getWalletAddress()
        : this.rewardReceiver

    // Simulate the call
    try {
      tx = this.medianizer.updateResult(rewardReceiver)
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('ChainlinkTWAP/invalid-timestamp')) {
        console.log('Chainlink aggregator is stale waiting for an update')
      } else if (err.startsWith('ChainlinkTWAP/wait-more')) {
        console.log('Too early to update')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send the transaction
    const hash = await this.transactor.ethSend(tx, true, CHAINLINK_MEDIANIZER__UPDATE_RESULTS_GAS)
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}

export class UniswapMedianizerPinger {
  protected medianizer: contracts.UniswapConsecutiveSlotsMedianRaiusd
  protected transactor: Transactor
  protected rateSetter: contracts.PiRateSetter

  constructor(
    medianizerAddress: string,
    rateSetterAddress: string,
    wallet: ethers.Signer,
    protected minUpdateIntervalMedian: number,
    protected minUpdateIntervalRateSetter: number,
    protected rewardReceiver: string
  ) {
    this.transactor = new Transactor(wallet)
    this.medianizer = this.transactor.getGebContract(
      contracts.UniswapConsecutiveSlotsMedianRaiusd,
      medianizerAddress
    )
    this.rateSetter = this.transactor.getGebContract(contracts.PiRateSetter, rateSetterAddress)
  }

  public async ping() {
    // First, update the TWAP median
    const didUpdateMedian = await this.updateMedian()
    // Then update the rate setter
    await this.updateRateSetter(didUpdateMedian)
  }

  async updateMedian(): Promise<boolean> {
    let tx: TransactionRequest

    // Check if it's too early to update
    const lastUpdatedTime = await this.medianizer.lastUpdateTime()
    if (now().sub(lastUpdatedTime).lt(this.minUpdateIntervalMedian)) {
      // Too early to update but still checking if there is a pending transaction
      // If there is a pending tx, continue the execution so you bump the gas price
      if (!(await this.transactor.isAnyTransactionPending())) {
        console.log('Too early to update')
        return false
      } else {
        console.log(
          'Too early to update but there is pending tx so continue execution in order to bump the gas price'
        )
      }
    }

    // Simulate call
    try {
      tx = this.medianizer.updateResult(this.rewardReceiver)
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('UniswapConsecutiveSlotsPriceFeedMedianizer/not-enough-time-elapsed')) {
        console.log('The Uniswap median cannot be updated just yet')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return false
    }

    // Send transaction
    const hash = await this.transactor.ethSend(tx, true, COIN_MEDIANIZER__UPDATE_RESULTS_GAS)
    console.log(`Median update sent, transaction hash: ${hash}`)

    return true
  }

  async updateRateSetter(didUpdateMedian: boolean): Promise<void> {
    let tx: TransactionRequest

    const lastUpdatedTime = await this.rateSetter.lastUpdateTime()
    const needsUpdate = now().sub(lastUpdatedTime).gte(this.minUpdateIntervalRateSetter)

    if (!didUpdateMedian && !needsUpdate) {
      // If the median was not updated or if it was updated too recently, skip
      return
    }

    try {
      tx = this.rateSetter.updateRate(this.rewardReceiver)

      // Simulate transaction to check if there are any expected errors
      await this.transactor.ethCall(tx)

      // We don't force overwrite if we just submitted the median update
      const hash = await await this.transactor.ethSend(
        tx,
        !didUpdateMedian,
        RATE_SETTER__UPDATE_RATE_GAS
      )
      console.log(`Rate setter update sent, transaction hash: ${hash}`)
    } catch (err) {
      if (typeof err == 'string' && err.startsWith('PIRateSetter/wait-more')) {
        // Rate setter was updated too recently. This should not be the case because we checked for the update above
        // await notifier.sendError(`RateSetter/wait-more`)
        console.log('Too early to update Rate Setter')
      } else {
        await notifier.sendError(`Unexpected error while simulating call: ${err}`)
      }
    }
  }
}
