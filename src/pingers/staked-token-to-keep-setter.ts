import { adminContracts, TransactionRequest } from '@reflexer-finance/geb-admin'
import { ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { SETTER_GAS_500K } from '../utils/constants'

export class StakedTokensToKeepSetter {
  protected setter: adminContracts.StakedTokensToKeepSetter
  protected transactor: Transactor

  constructor(
    setterAddress: string,
    wallet: ethers.Signer,
  ) {
    this.transactor = new Transactor(wallet)
    this.setter = this.transactor.getGebContract(
      adminContracts.StakedTokensToKeepSetter,
      setterAddress
    )
  }

  public async ping() {
    let tx: TransactionRequest
    // Simulate the call
    try {
      tx = this.setter.recomputeTokensToKeep()
      await this.transactor.ethCall(tx)
    } catch (err) {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      return
    }

    // Send the transaction
    const hash = await this.transactor.ethSend(tx, true, SETTER_GAS_500K)
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
