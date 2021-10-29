import { contracts, TransactionRequest } from '@reflexer-finance/geb-admin'
import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { SETTER_GAS_500K } from '../utils/constants'

export class RedemptionPriceSnapOracle {
  private oracleRelayer: contracts.OracleRelayer
  private transactor: Transactor

  constructor(
    private snapOracleAddress: string,
    oracleRelayerAddress: string,
    private minDeviationThreshold: number,
    private wallet: ethers.Signer
  ) {
    if (!wallet.provider) {
      throw new Error('The signer needs a provider')
    }

    this.transactor = new Transactor(wallet)
    this.oracleRelayer = this.transactor.getGebContract(
      contracts.OracleRelayer,
      oracleRelayerAddress
    )
  }

  public async ping() {
    let tx: TransactionRequest

    const contract = new ethers.Contract(
      this.snapOracleAddress,
      [
        'function updateSnappedPrice() public',
        'function snappedRedemptionPrice() public view returns (uint256)',
      ],
      this.wallet.provider
    )

    const bnToNUmber = (bn: BigNumber, decimal: number) => Number(bn.toString()) / 10 ** decimal

    const currentSnapPrice = bnToNUmber(await contract.snappedRedemptionPrice(), 27)
    const currentRedemptionPrice = bnToNUmber(
      await this.oracleRelayer.redemptionPrice_readOnly(),
      27
    )

    const deviation = Math.abs(currentRedemptionPrice - currentSnapPrice) / currentRedemptionPrice

    if (deviation < this.minDeviationThreshold) {
      console.log(`Current deviation is below update threshold: ${deviation * 100}%`)
      return
    }

    // Simulate the call
    try {
      tx = await contract.populateTransaction.updateSnappedPrice()
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
