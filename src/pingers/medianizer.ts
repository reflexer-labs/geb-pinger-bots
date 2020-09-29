import { ethers, BigNumber } from 'ethers'
import { GebEthersProvider, contracts, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'

export class ChainlinkMedianizerPinger {
  // We use an UniswapMedian contract but it can be a Chainlink Median as well
  protected medianizer: contracts.ChainlinkMedianEthusd
  protected transactor: Transactor

  constructor(
    medianizerAddress: string,
    private wallet: ethers.Signer,
    protected minMedianizerUpdateInterval: number,
    protected rewardReceiver: string
  ) {
    const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
    this.transactor = new Transactor(this.wallet)
    this.medianizer = new contracts.ChainlinkMedianEthusd(medianizerAddress, gebProvider)
  }

  public async ping() {
    let tx: TransactionRequest

    // Since Chainlink median can be updated by the uniswap median, check that it wasn't updated too recently
    const lastUpdate = await this.medianizer.lastUpdateTime()
    const provider = this.wallet.provider as ethers.providers.Provider
    const currentBlockTime = (await provider.getBlock('latest')).timestamp
    if (BigNumber.from(currentBlockTime).sub(lastUpdate).lte(this.minMedianizerUpdateInterval)) {
      console.log(
        `Medianizer recently updated, not updating at the moment (minMedianizerUpdateInterval).`
      )
      return
    }

    // Send the caller reward to specified address or send the reward to the pinger bot
    let rewardReceiver =
      !this.rewardReceiver || this.rewardReceiver === ''
        ? await this.wallet.getAddress()
        : this.rewardReceiver

    // Simulate call
    try {
      tx = this.medianizer.updateResult(rewardReceiver)
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('ChainlinkPriceFeedMedianizer/invalid-timestamp')) {
        console.log('Chainlink aggregator is stale waiting for an update')
      } else {
        notifier.sendAllChannels(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send transaction
    const hash = await this.transactor.ethSend(tx)
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}

export class UniswapMedianizerPinger {
  protected medianizer: contracts.UniswapMedian
  protected transactor: Transactor

  constructor(
    medianizerAddress: string,
    protected wallet: ethers.Signer,
    protected minMedianizerUpdateInterval: number,
    protected rewardReceiver: string
  ) {
    const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
    this.transactor = new Transactor(this.wallet)
    this.medianizer = new contracts.UniswapMedian(medianizerAddress, gebProvider)
  }

  public async ping() {
    let tx: TransactionRequest

    // Send the caller reward to specified address or send the reward to the pinger bot
    let rewardReceiver =
      !this.rewardReceiver || this.rewardReceiver === ''
        ? await this.wallet.getAddress()
        : this.rewardReceiver

    // Simulate call
    try {
      tx = this.medianizer.updateResult(rewardReceiver)
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('UniswapConsecutiveSlotsPriceFeedMedianizer/not-enough-time-elapsed')) {
        console.log('Uniswap median cannot yet be updated')
      } else {
        notifier.sendAllChannels(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send transaction
    const hash = await this.transactor.ethSend(tx)
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
