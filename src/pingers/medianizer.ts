import { ethers, BigNumber } from 'ethers'
import { contracts, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { now } from '../utils/time'

export class ChainlinkMedianizerPinger {
  // We use an UniswapMedian contract but it can be a Chainlink median as well
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
      if (err.startsWith('ChainlinkPriceFeedMedianizer/invalid-timestamp')) {
        console.log('Chainlink aggregator is stale waiting for an update')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Since UniswapMedianizerPinger is also updating the Chainlink ETH pinger, do
    // not update the Chainlink ETH pinger if the UniswapMedianizerPinger has a
    // pending transaction (meaning that it's updating the Chainlink oracle)
    if (await this.transactor.isAnyTransactionPending(this.uniswapMedianizerAddress)) {
      console.log(
        'UniswapMedianizerPinger has a pending transaction. Do not send a Chainlink median update since UniswapMedianizerPinger will update the Chainlink median by itself.'
      )
      return
    }

    // Send the transaction
    const hash = await this.transactor.ethSend(tx, true, BigNumber.from('400000'))
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}

export class UniswapMedianizerPinger {
  protected medianizer: contracts.UniswapConsecutiveSlotsMedianRaiusd
  protected transactor: Transactor
  protected rateSetter: contracts.RateSetter

  constructor(
    medianizerAddress: string,
    rateSetterAddress: string,
    wallet: ethers.Signer,
    protected minUpdateIntervalMedian: number,
    protected rewardReceiver: string
  ) {
    this.transactor = new Transactor(wallet)
    this.medianizer = this.transactor.getGebContract(
      contracts.UniswapConsecutiveSlotsMedianRaiusd,
      medianizerAddress
    )
    this.rateSetter = this.transactor.getGebContract(contracts.RateSetter, rateSetterAddress)
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
    const hash = await this.transactor.ethSend(tx, true, BigNumber.from('500000'))
    console.log(`Median update sent, transaction hash: ${hash}`)

    return true
  }

  async updateRateSetter(didUpdateMedian: boolean): Promise<void> {
    let tx: TransactionRequest

    const lastUpdatedTime = await this.rateSetter.lastUpdateTime()
    const needsUpdate = now().sub(lastUpdatedTime).gte(this.minUpdateIntervalMedian)

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
        BigNumber.from('400000')
      )
      console.log(`Rate setter update sent, transaction hash: ${hash}`)
    } catch (err) {
      if (typeof err == 'string' && err.startsWith('RateSetter/wait-more')) {
        // Rate setter was updated too recently. This should not be the case because we checked for the update above
        // await notifier.sendError(`RateSetter/wait-more`)
        console.log('Too early to update Rate Setter')
      } else {
        await notifier.sendError(`Unexpected error while simulating call: ${err}`)
      }
    }
  }
}

// This pinger is similar the the standard UniswapMedianizerPinger one but it has an additional check
// We check that the deviation between market price and redemption price is < minSystemCoinMedianDeviation
export class UniswapSpotMedianizerPinger extends UniswapMedianizerPinger {
  protected oracleRelayer: contracts.OracleRelayer
  protected medianizerEth: contracts.UniswapConsecutiveSlotsMedianRaiusd
  protected collateralAuctionHouse: contracts.FixedDiscountCollateralAuctionHouse
  protected uniPair: contracts.UniswapV2Pair

  constructor(
    medianizerRaiSpotAddress: string,
    // If there are several collateral auction house addresses, pass the one with the smallest deviation parameter
    medianizerEthAddress: string,
    uniPairAddress: string,
    oracleRelayerAddress: string,
    collateralAuctionHouseAddress: string,
    wallet: ethers.Signer,
    minUpdateIntervalMedian: number,
    rewardReceiver: string
  ) {
    super(
      medianizerRaiSpotAddress,
      '0x0000000000000000000000000000000000000000',
      wallet,
      minUpdateIntervalMedian,
      rewardReceiver
    )

    this.oracleRelayer = this.transactor.getGebContract(
      contracts.OracleRelayer,
      oracleRelayerAddress
    )

    this.medianizerEth = this.transactor.getGebContract(
      contracts.UniswapConsecutiveSlotsMedianRaiusd,
      medianizerEthAddress
    )

    this.collateralAuctionHouse = this.transactor.getGebContract(
      contracts.FixedDiscountCollateralAuctionHouse,
      collateralAuctionHouseAddress
    )

    this.uniPair = this.transactor.getGebContract(contracts.UniswapV2Pair, uniPairAddress)
  }

  public async ping() {
    // Horrible calculation of the current RAI/USD price with precision loss...
    const redemptionPrice =
      Number((await this.oracleRelayer.redemptionPrice_readOnly()).toString()) / 1e27

    const ethPrice = Number((await this.medianizerEth.read()).toString()) / 1e18

    const token0Address = await this.uniPair.token0()
    const token1Address = await this.uniPair.token1()

    const reserves = await this.uniPair.getReserves()
    const reserve0 = Number(reserves[0].toString()) / 1e18
    const reserve1 = Number(reserves[1].toString()) / 1e18

    // RAI/ETH price from Uniswap
    let raiEthUniSpotPrice: number

    // Uniswap labels ETH and RAI tokens0 or token1 depending on the order of their
    // token addresses. Note, we have precision loss with the conversion But it should
    // not matter.
    if (BigNumber.from(token0Address).lt(BigNumber.from(token1Address))) {
      raiEthUniSpotPrice = reserve1 / reserve0
    } else {
      raiEthUniSpotPrice = reserve0 / reserve1
    }

    const usdRaiPrice = ethPrice / raiEthUniSpotPrice

    const minDeviation =
      Number((await this.collateralAuctionHouse.minSystemCoinMedianDeviation()).toString()) / 1e18

    if (
      usdRaiPrice < redemptionPrice * minDeviation ||
      usdRaiPrice > redemptionPrice * (2 - minDeviation)
    ) {
      console.log('Deviation larger than threshold, update the pinger')

      // Call the standard median pinger from here
      await super.updateMedian()
    } else {
      console.log(
        'Do not update the spot pinger, small deviation between spot and redemption price'
      )
    }
  }
}
