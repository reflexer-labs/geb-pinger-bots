import { BigNumber, Contract, ethers } from 'ethers'
import { contracts, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { COIN_TWAP__UPDATE_RESULTS_GAS, RATE_SETTER__UPDATE_RATE_GAS } from '../utils/constants'
import { now } from '../utils/time'

export class CoinTwapAndRateSetter {
  protected twap: contracts.UniswapConsecutiveSlotsMedianRaiusd
  protected transactor: Transactor
  protected rateSetter: contracts.PiRateSetter

  constructor(
    twapAddress: string,
    rateSetterAddress: string,
    wallet: ethers.Signer,
    protected minUpdateIntervalTwap: number,
    protected minUpdateIntervalRateSetter: number,
    protected rewardReceiver: string
  ) {
    this.transactor = new Transactor(wallet)
    this.twap = this.transactor.getGebContract(
      contracts.UniswapConsecutiveSlotsMedianRaiusd,
      twapAddress
    )
    this.rateSetter = this.transactor.getGebContract(contracts.PiRateSetter, rateSetterAddress)
  }

  public async ping() {
    // First, update the TWAP
    const didUpdatedTwap = await this.updatedTwap()
    // Then update the rate setter
    await this.updateRateSetter(didUpdatedTwap)
  }

  async updatedTwap(): Promise<boolean> {
    let tx: TransactionRequest

    // Check if it's too early to update
    const lastUpdatedTime = await this.twap.lastUpdateTime()
    if (now().sub(lastUpdatedTime).lt(this.minUpdateIntervalTwap)) {
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
      tx = this.twap.updateResult(this.rewardReceiver)
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('ChainlinkTWAP/wait-more')) {
        console.log('The twap cannot be updated just yet')
      } else if (err.startsWith('ChainlinkTWAP/invalid-timestamp')) {
        // We can't update because chainlink is stall, throw error only if it was stall for a long time
        
        // Fetch the latest chainlink timestamp from the chainlink aggregator
        const chainlinkAggregatorAddress: string = await new Contract(this.twap.address, [
          'function chainlinkAggregator() public view returns (address)',
        ], this.transactor.provider).chainlinkAggregator()
        const lastChainlinkUpdate: BigNumber = await new Contract(chainlinkAggregatorAddress, [
          'function latestTimestamp() public view returns (uint256)',
        ], this.transactor.provider).latestTimestamp()

        if (
          now()
            .sub(lastChainlinkUpdate)
            .gt(3600 * 36)
        ) {
          await notifier.sendError(`Chainlink aggregator stall for more than 36h`)
        }
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return false
    }

    // Send transaction
    const hash = await this.transactor.ethSend(tx, true, COIN_TWAP__UPDATE_RESULTS_GAS)
    console.log(`Twap update sent, transaction hash: ${hash}`)

    return true
  }

  async updateRateSetter(didUpdatedTwap: boolean): Promise<void> {
    let tx: TransactionRequest

    const lastUpdatedTime = await this.rateSetter.lastUpdateTime()
    const needsUpdate = now().sub(lastUpdatedTime).gte(this.minUpdateIntervalRateSetter)

    if (!didUpdatedTwap && !needsUpdate) {
      // If the Twap was not updated or if it was updated too recently, skip
      return
    }

    try {
      tx = this.rateSetter.updateRate(this.rewardReceiver)

      // Simulate transaction to check if there are any expected errors
      await this.transactor.ethCall(tx)

      // We don't force overwrite if we just submitted the twap update
      const hash = await await this.transactor.ethSend(
        tx,
        !didUpdatedTwap,
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
