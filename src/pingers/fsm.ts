import { BigNumber, ethers } from 'ethers'
import { contracts, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { now } from '../utils/time'

export class CollateralFsmPinger {
  private fsm: contracts.Osm
  private oracleRelayer: contracts.OracleRelayer
  private transactor: Transactor

  constructor(
    osmAddress: string,
    oracleRelayerAddress: string,
    private collateralType: string,
    wallet: ethers.Signer,
    protected minUpdateInterval
  ) {
    this.transactor = new Transactor(wallet)
    this.fsm = this.transactor.getGebContract(contracts.Osm, osmAddress)
    this.oracleRelayer = this.transactor.getGebContract(
      contracts.OracleRelayer,
      oracleRelayerAddress
    )
  }

  public async ping() {
    let txFsm: TransactionRequest

    // Check if it's too early to update
    const lastUpdatedTime = await this.fsm.lastUpdateTime()
    if (now().sub(lastUpdatedTime).lt(this.minUpdateInterval)) {
      // To early to update but still check if there a pending transaction.
      // If yes continue the execution that will bump the gas price.
      if (!(await this.transactor.isAnyTransactionPending())) {
        console.log('To early to update')
        return
      }
    }

    // Simulate call
    try {
      txFsm = this.fsm.updateResult()
      await this.transactor.ethCall(txFsm)
    } catch (err) {
      if (
        typeof err == 'string' &&
        (err.startsWith('OSM/not-passed') || err.startsWith('DSM/not-passed'))
      ) {
        console.log('FSM not yet ready to be updated')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send OSM transaction
    let hash = await this.transactor.ethSend(txFsm, true, BigNumber.from('200000'))
    console.log(`FSM update sent, transaction hash: ${hash}`)

    // Directly update the relayer after updating the OSM
    let txRelayer = this.oracleRelayer.updateCollateralPrice(this.collateralType)

    // Send oracle relayer transaction
    hash = await await this.transactor.ethSend(txRelayer, false, BigNumber.from('200000'))
    console.log(`Oracle relayer update sent, transaction hash: ${hash}`)
  }
}
