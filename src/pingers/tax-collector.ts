import { BigNumber, ethers } from 'ethers'
import { contracts } from 'geb.js'
import { Transactor } from '../chains/transactor'
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
      // To early to update but still check if there a pending transaction.
      // If yes continue the execution that will bump the gas price.
      if (!(await this.transactor.isAnyTransactionPending())) {
        console.log('To early to update')
        return
      }
    }

    const tx = this.taxCollector.taxSingle(this.collateralType)
    const hash = await this.transactor.ethSend(tx, true, BigNumber.from('200000'))
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
