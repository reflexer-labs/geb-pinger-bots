import { ethers } from 'ethers'
import { contracts, GebEthersProvider } from 'geb.js'
import { BasePinger } from './base'

export abstract class FsmPinger extends BasePinger {
    protected fsm: contracts.Osm
    constructor(osmAddress: string, wallet: ethers.Signer) {
        super(wallet)
        const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
        this.fsm = new contracts.Osm(osmAddress, gebProvider)
    }

    protected async updateResults(): Promise<boolean> {
        if (await this.fsm.passedDelay()) {
            await this.sendPing(this.fsm.updateResult())
            return true
        } else {
            console.log('FSM not yet ready to be updated')
            return false
        }
    }
}

export class CollateralFsmPinger extends FsmPinger {
    private oracleRelayer: contracts.OracleRelayer
    constructor(
        osmAddress: string,
        oracleRelayerAddress: string,
        private collateralType: string,
        wallet: ethers.Signer
    ) {
        super(osmAddress, wallet)
        const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
        this.oracleRelayer = new contracts.OracleRelayer(oracleRelayerAddress, gebProvider)
    }

    public async ping() {
        if (await this.updateResults()) {
            const tx = this.oracleRelayer.updateCollateralPrice(this.collateralType)
            const provider = this.wallet.provider as ethers.providers.Provider
            tx.nonce =
                (await provider.getTransactionCount(await this.wallet.getAddress(), 'latest')) + 1
            await this.sendPing(tx)
        }
    }
}

export class CoinFsmPinger extends FsmPinger {
    // private oracleRelayer: contracts.RateSetter
    constructor(osmAddress: string, rateSetterAddress: string, wallet: ethers.Signer) {
        super(osmAddress, wallet)
        const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
        // this.RateSetter = new contracts.RateSetter(rateSetterAddress, gebProvider)
    }

    public async ping() {
        await this.updateResults()
        // await this.sendPing(this.rateSetter.updateRate())
    }
}
