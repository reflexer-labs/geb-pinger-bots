import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'

export class BalanceChecker {
  private transactor: Transactor

  constructor(
    // [Bot name, bot address][]
    private bots: [string, string][],
    private minBalance: BigNumber,
    provider: ethers.providers.Provider
  ) {
    this.transactor = new Transactor(provider)
  }

  async check() {
    for (let bot of this.bots) {
      const balance = await this.transactor.getBalance(bot[1])
      if (balance.lt(this.minBalance)) {
        await notifier.sendError(`Bot ${bot[0]} address: ${bot[1]} is low balance.`)
      }
    }
  }
}
