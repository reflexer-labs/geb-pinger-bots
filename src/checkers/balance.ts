import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'
import { Checker } from './base'

export class BalanceChecker extends Checker {
    constructor(
        private addreses: string[],
        private minBalance: BigNumber,
        private provider: ethers.providers.Provider
    ) {
        super()
    }

    async check() {
        for (let address of this.addreses) {
            const balance = await this.provider.getBalance(address)
            if (balance.lt(this.minBalance)) {
                notifier.sendAllChannels(`Bot balance address: ${address} low balance.`)
            }
        }
    }
}
