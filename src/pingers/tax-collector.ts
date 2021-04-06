import { ethers } from 'ethers'
import { contracts } from 'geb.js'
import { Transactor } from '../chains/transactor'
import { TAX_COLLECTOR__TAX_SINGLE_GAS } from '../utils/constants'
import { now } from '../utils/time'

export class TaxCollectorPinger {
  private taxCollector: contracts.TaxCollector
  protected transactor: Transactor
  constructor(
    taxCollectorAddress: string,
    wallet: ethers.Signer,
    private collateralType: string,
    private minUpdateInterval
  ) {
    this.transactor = new Transactor(wallet)
    this.taxCollector = this.transactor.getGebContract(contracts.TaxCollector, taxCollectorAddress)
  }

  public async ping() {
    // Check if it's too early to update
    const lastUpdatedTime = (await this.taxCollector.collateralTypes(this.collateralType))
      .updateTime
    if (now().sub(lastUpdatedTime).lt(this.minUpdateInterval)) {
      // Too early to update but still checking if there's a pending transaction
      // If there is a pending tx, continue the execution in order to bump the gas price
      if (!(await this.transactor.isAnyTransactionPending())) {
        console.log('Too early to update')
        return
      }
    }

    const tx = this.taxCollector.taxSingle(this.collateralType)
    const hash = await this.transactor.ethSend(tx, true, TAX_COLLECTOR__TAX_SINGLE_GAS)
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
