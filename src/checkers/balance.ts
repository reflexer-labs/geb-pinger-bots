import { ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'

export class BalanceChecker {
  private transactor: Transactor

  constructor(
    // [Bot name, bot address, min balance in ETH][]
    private bots: [string, string, number][],
    provider: ethers.providers.Provider,
    private slackIdMention?: string
  ) {
    this.transactor = new Transactor(provider)
  }

  async check() {
    for (let bot of this.bots) {
      const balance = await this.transactor.getBalance(bot[1])
      if (balance.lt(ethers.utils.parseEther(bot[2].toString()))) {
        await notifier.sendError(
          `<!here> ${this.slackIdMention ? `<@${this.slackIdMention}>` : ''} Bot ${
            bot[0]
          } address: ${bot[1]} has a low ETH balance: ${ethers.utils.formatEther(balance).slice(0,8)} ETH`
        )
      }
    }
  }
}
