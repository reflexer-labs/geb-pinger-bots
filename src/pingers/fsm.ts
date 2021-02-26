import { BigNumber, ethers } from 'ethers'
import { contracts, TransactionRequest, utils } from 'geb.js'
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
    protected minUpdateInterval: number
  ) {
    this.transactor = new Transactor(wallet)
    this.fsm = this.transactor.getGebContract(contracts.Osm, osmAddress)
    this.oracleRelayer = this.transactor.getGebContract(
      contracts.OracleRelayer,
      oracleRelayerAddress
    )
  }

  public async ping() {
    let didUpdateFsm = false

    // Check if it's too early to update
    const fsmLastUpdatedTime = await this.fsm.lastUpdateTime()

    // Update the FSM enough time has passed or if there is a transaction pending
    // Transaction pending means that the tx from the last run got stuck in the mempool
    if (
      now().sub(fsmLastUpdatedTime).gte(this.minUpdateInterval) ||
      (await this.transactor.isAnyTransactionPending())
    ) {
      // Simulate call
      let txFsm: TransactionRequest
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

      // Send FSM transaction
      let fsmHash = await this.transactor.ethSend(txFsm, true, BigNumber.from('200000'))
      didUpdateFsm = true
      console.log(`FSM update sent, transaction hash: ${fsmHash}`)
    } else {
      console.log('To early to update the FSM')
    }

    // == Oracle Relayer ==

    // Update Oracle relayer if we just updated the fsm OR
    // if was updated too long ago
    if (didUpdateFsm || (await this.shouldUpdateOracleRelayer())) {
      let txRelayer = this.oracleRelayer.updateCollateralPrice(this.collateralType)
      // Send oracle relayer transaction
      let relayerHash = await await this.transactor.ethSend(
        txRelayer,
        !didUpdateFsm,
        BigNumber.from('200000')
      )
      console.log(`Oracle relayer update sent, transaction hash: ${relayerHash}`)
    } else {
      console.log('To early to update the Oracle Relayer')
    }
  }

  // Check if the oracle relayer needs to be updated by looking at the last time
  // it was updated
  private async shouldUpdateOracleRelayer() {
    const currentBlock = await this.transactor.getBlockNumber()

    // Get the last updated events
    // Assume a 15sec block interval
    const scanFromBlock = currentBlock - this.minUpdateInterval / 15
    const events = await this.transactor.getContractEvents(
      'event UpdateCollateralPrice(bytes32 indexed collateralType, uint256 priceFeedValue, uint256 safetyPrice, uint256 liquidationPrice)',
      this.oracleRelayer.address,
      scanFromBlock,
      currentBlock
    )
    const lastEvents = await events
      // Remove events related to other collateral types
      .filter((x) => ((x.args as ethers.utils.Result).collateralType as string) === utils.ETH_A)
      // Sort events by descending time
      .sort((a, b) => b.blockNumber - a.blockNumber)

    // Update if they are no recent event or the latest one is more than minUpdateInterval old
    if (lastEvents.length === 0) {
      return true
    } else {
      const lastUpdateTimeOracleRelayer = (await lastEvents[0].getBlock()).timestamp
      return now().sub(lastUpdateTimeOracleRelayer).gte(this.minUpdateInterval)
    }
  }
}
