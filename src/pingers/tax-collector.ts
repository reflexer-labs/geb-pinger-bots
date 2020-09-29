import { ethers } from 'ethers'
import { contracts, GebEthersProvider } from 'geb.js'
import { Transactor } from '../chains/transactor'

export class TaxCollectorPinger {
  private taxCollector: contracts.TaxCollector
  protected transactor: Transactor
  constructor(
    taxCollectorAddress: string,
    private wallet: ethers.Signer,
    private collateralType: string
  ) {
    const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
    this.transactor = new Transactor(this.wallet)
    this.taxCollector = new contracts.TaxCollector(taxCollectorAddress, gebProvider)
  }

  public async ping() {
    const tx = this.taxCollector.taxSingle(this.collateralType)
    const hash = await this.transactor.ethSend(tx)
    console.log(`Update sent, transaction hash: ${hash}`)
  }
}
