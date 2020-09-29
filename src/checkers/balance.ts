import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'

export class BalanceChecker {
  constructor(
    // [Bot name, bot address][]
    private bots: [string, string][],
    private minBalance: BigNumber,
    private provider: ethers.providers.Provider
  ) {}

  async check() {
    for (let bot of this.bots) {
      const balance = await this.provider.getBalance(bot[1])
      if (balance.lt(this.minBalance)) {
        await notifier.sendAllChannels(`Bot ${bot[0]} address: ${bot[1]} is low balance.`)
      }
    }
  }
}
