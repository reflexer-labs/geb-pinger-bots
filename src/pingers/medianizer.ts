import { ethers, BigNumber } from 'ethers'
import { GebEthersProvider, contracts } from 'geb.js'
import { BasePinger } from './base'

export class MedianizerPinger extends BasePinger {
    // We use an UniswapMedian contract but it can be a Chainlink Median as well
    protected medianizer: contracts.UniswapMedian

    constructor(
        medianizerAddress: string,
        wallet: ethers.Signer,
        public minMedianizerUpdateInterval: number
    ) {
        super(wallet)
        const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
        this.medianizer = new contracts.UniswapMedian(medianizerAddress, gebProvider)
    }

    public async ping() {
        const lastUpdate = await this.medianizer.lastUpdateTime()
        const provider = this.wallet.provider as ethers.providers.Provider
        const currentBlockTime = (await provider.getBlock('latest')).timestamp
        if (
            BigNumber.from(currentBlockTime).sub(lastUpdate).lte(this.minMedianizerUpdateInterval)
        ) {
            console.log(
                `Medianizer recently updated, not updating at the moment (minMedianizerUpdateInterval).`
            )
            return
        }

        const tx = this.medianizer.updateResult(await this.wallet.getAddress())
        await this.sendPing(tx)
    }
}

export class UniswapMedianizerPinger extends MedianizerPinger {
    public async ping() {
        // Uniswap oracle can't only be call every interval (windowSize / granularity)
        const provider = this.wallet.provider as ethers.providers.Provider
        const now = BigNumber.from((await provider.getBlock('latest')).timestamp)
        const observationIndex = await this.medianizer.observationIndexOf(now)
        const timeElapsedSinceLatest = now.sub(
            (await this.medianizer.uniswapObservations(observationIndex)).timestamp
        )
        const periodSize = await this.medianizer.periodSize()
        if (timeElapsedSinceLatest.gt(periodSize)) {
            await super.ping()
        } else {
            console.log('Uniswap median cannot yet be updated')
        }
    }
}
