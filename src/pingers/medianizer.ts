import { ethers, BigNumber } from 'ethers'
import { contracts, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { now } from '../utils/time'

export class ChainlinkMedianizerPinger {
  // We use an UniswapMedian contract but it can be a Chainlink Median as well
  protected medianizer: contracts.ChainlinkMedianEthusd
  protected transactor: Transactor

  constructor(
    chainlinkMedianizerAddress: string,
    protected uniswapMedianizerAddress: string,
    wallet: ethers.Signer,
    protected minUpdateInterval: number,
    protected rewardReceiver: string
  ) {
    this.transactor = new Transactor(wallet)
    this.medianizer = this.transactor.getGebContract(
      contracts.ChainlinkMedianEthusd,
      chainlinkMedianizerAddress
    )
  }

  public async ping() {
    let tx: TransactionRequest

    // // Check if it's too early to update
    const lastUpdatedTime = await this.medianizer.lastUpdateTime()
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
    try {
      tx = this.medianizer.updateResult(rewardReceiver)
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('ChainlinkPriceFeedMedianizer/invalid-timestamp')) {
        console.log('Chainlink aggregator is stale waiting for an update')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Since UniswapMedianizerPinger is also updating the Chainlink ETH pinger, do
    // not update the Chainlink ETH pinger if the UniswapMedianizerPinger has a
    // pending transaction (meaning that it's updating it).
    if (await this.transactor.isAnyTransactionPending(this.uniswapMedianizerAddress)) {
      console.log(
        'UniswapMedianizerPinger has pending transaction. Do not send a median update since UniswapMedianizerPinger will update Chainlink median if possible.'
      )
      return
    }

    // Send transaction
    const hash = await this.transactor.ethSend(tx, true, BigNumber.from('400000'))
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}

export class UniswapMedianizerPinger {
  protected medianizer: contracts.UniswapConsecutiveSlotsMedianRaiusd
  protected transactor: Transactor

  constructor(
    medianizerAddress: string,
    wallet: ethers.Signer,
    protected minUpdateInterval: number,
    protected rewardReceiver: string
  ) {
    this.transactor = new Transactor(wallet)
    this.medianizer = this.transactor.getGebContract(
      contracts.UniswapConsecutiveSlotsMedianRaiusd,
      medianizerAddress
    )
  }

  public async ping() {
    let tx: TransactionRequest

    // Check if it's too early to update
    const lastUpdatedTime = await this.medianizer.lastUpdateTime()
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
    try {
      tx = this.medianizer.updateResult(rewardReceiver)
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('UniswapConsecutiveSlotsPriceFeedMedianizer/not-enough-time-elapsed')) {
        console.log('Uniswap median cannot yet be updated')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send transaction
    const hash = await this.transactor.ethSend(tx, true, BigNumber.from('500000'))
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}

// This pinger is similar the the standard UniswapMedianizerPinger with one additional check.
// We check that the deviation between market price  and redemption price is < minSystemCoinMedianDeviation
export class UniswapSpotMedianizerPinger extends UniswapMedianizerPinger {
  protected collateralAuctionHouse: contracts.FixedDiscountCollateralAuctionHouse
  protected oracleRelayer: contracts.OracleRelayer

  constructor(
    medianizerAddress: string,
    // If several collateral auction house address, pass the one with the smallest deviation parameter.
    collateralAuctionHouseAddress: string,
    oracleRelayerAddress: string,
    wallet: ethers.Signer,
    minUpdateInterval: number,
    rewardReceiver: string
  ) {
    super(medianizerAddress, wallet, minUpdateInterval, rewardReceiver)
    this.collateralAuctionHouse = this.transactor.getGebContract(
      contracts.FixedDiscountCollateralAuctionHouse,
      collateralAuctionHouseAddress
    )
    this.oracleRelayer = this.transactor.getGebContract(
      contracts.OracleRelayer,
      oracleRelayerAddress
    )
  }

  public async ping() {
    const redemptionPrice = await this.oracleRelayer.redemptionPrice_readOnly()
    // Fetch the RAI price that the auction house would use in case au auction
    const auctionRaiPrice = (
      await this.collateralAuctionHouse.getFinalTokenPrices(redemptionPrice)
    )[1]
    if (redemptionPrice.eq(auctionRaiPrice)) {
      // We do not meet the price deviation requirement, therefore there is no need to update
      // this pinger.
      console.log('Not updating, price deviation requirement not met.')
      return
    }

    // Call the standard median pinger from here
    super.ping()
  }
}
