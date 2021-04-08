import { ethers } from 'ethers'
import { contracts, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { STABILITY_FEE_TREASURY__TRANSFER_SURPLUS_FUNDS_GAS } from '../utils/constants'

export class StabilityFeeTreasuryPinger {
  private stabilityFeeTreasury: contracts.StabilityFeeTreasury
  protected transactor: Transactor
  constructor(stabilityFeeTreasuryAddress: string, wallet: ethers.Signer) {
    this.transactor = new Transactor(wallet)
    this.stabilityFeeTreasury = this.transactor.getGebContract(
      contracts.StabilityFeeTreasury,
      stabilityFeeTreasuryAddress
    )
  }

  public async ping() {
    let tx: TransactionRequest

    // Simulate the call
    try {
      tx = this.stabilityFeeTreasury.transferSurplusFunds()
      await this.transactor.ethCall(tx)
    } catch (err) {
      if (err.startsWith('StabilityFeeTreasury/transfer-cooldown-not-passed')) {
        console.log('Stability Fee treasury not yet ready to be updated')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    const hash = await this.transactor.ethSend(
      tx,
      true,
      STABILITY_FEE_TREASURY__TRANSFER_SURPLUS_FUNDS_GAS
    )
    console.log(`Surplus funds transferred, transaction hash: ${hash}`)
  }
}
