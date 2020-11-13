import { BigNumber, ethers } from 'ethers'
import { contracts } from 'geb.js'
import { Transactor } from '../chains/transactor'

export class TaxCollectorPinger {
  private taxCollector: contracts.TaxCollector
  protected transactor: Transactor
  constructor(taxCollectorAddress: string, wallet: ethers.Signer, private collateralType: string) {
    this.transactor = new Transactor(wallet)
    this.taxCollector = this.transactor.getGebContract(contracts.TaxCollector, taxCollectorAddress)
  }

  public async ping() {
    const tx = this.taxCollector.taxSingle(this.collateralType)
    const hash = await this.transactor.ethSend(tx, true, BigNumber.from('200000'))
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
