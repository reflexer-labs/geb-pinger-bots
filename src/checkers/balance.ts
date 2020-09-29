import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'
import { Checker } from './base'

export class BalanceChecker extends Checker {
  constructor(
    // [Bot name, bot address][]
    private bots: [string, string][],
    private minBalance: BigNumber,
    private provider: ethers.providers.Provider
  ) {
    super()
  }

  async check() {
    for (let bot of this.bots) {
      const balance = await this.provider.getBalance(bot[1])
      if (balance.lt(this.minBalance)) {
        await notifier.sendAllChannels(`Bot ${bot[0]} address: ${bot[1]} is low balance.`)
      }
    }
  }
}
