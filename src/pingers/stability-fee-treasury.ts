import { ethers } from 'ethers'
import { contracts, GebEthersProvider, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'

export class StabilityFeeTreasuryPinger {
  private stabilityFeeTreasury: contracts.StabilityFeeTreasury
  protected transactor: Transactor
  constructor(stabilityFeeTreasuryAddress: string, private wallet: ethers.Signer) {
    const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
    this.transactor = new Transactor(this.wallet)
    this.stabilityFeeTreasury = new contracts.StabilityFeeTreasury(
      stabilityFeeTreasuryAddress,
      gebProvider
    )
  }

  public async ping() {
    let tx: TransactionRequest

    // Simulate call
    try {
      tx = this.stabilityFeeTreasury.transferSurplusFunds()
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('StabilityFeeTreasury/transfer-cooldown-not-passed')) {
        console.log('Stability Fee treasury not yet ready to be updated')
      } else {
        await notifier.sendAllChannels(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    const hash = await this.transactor.ethSend(tx)
    console.log(`Surplus funds transferred, transaction hash: ${hash}`)
  }
}
