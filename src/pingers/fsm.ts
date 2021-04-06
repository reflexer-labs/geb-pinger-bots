import { ethers } from 'ethers'
import { contracts, TransactionRequest, utils } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import {
  APPROXIMATED_BLOCK_INTERVAL,
  COLLATERAL_FSM__UPDATE_RESULTS_GAS,
  ORACLE_RELAYER__UPDATE_COLLATERAL_PRICE_GAS,
} from '../utils/constants'
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

    // Update the FSM if enough time has passed or if there is a transaction pending
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
      let fsmHash = await this.transactor.ethSend(txFsm, true, COLLATERAL_FSM__UPDATE_RESULTS_GAS)
      didUpdateFsm = true
      console.log(`FSM update sent, transaction hash: ${fsmHash}`)
    } else {
      console.log('To early to update the FSM')
    }

    // == Oracle Relayer ==

    // Update the OracleRelayer if we just updated a FSM OR if the relayer is stale
    if (didUpdateFsm || (await this.shouldUpdateOracleRelayer())) {
      let txRelayer = this.oracleRelayer.updateCollateralPrice(this.collateralType)
      // Send the OracleRelayer transaction
      let relayerHash = await await this.transactor.ethSend(
        txRelayer,
        !didUpdateFsm,
        ORACLE_RELAYER__UPDATE_COLLATERAL_PRICE_GAS
      )
      console.log(`OracleRelayer update sent, transaction hash: ${relayerHash}`)
    } else {
      console.log('Too early to update the OracleRelayer')
    }
  }

  // Check if the OracleRelayer needs to be updated by looking at the last update time
  private async shouldUpdateOracleRelayer() {
    const currentBlock = await this.transactor.getBlockNumber()

    // Get the latest OracleRelayer update events
    // Assume a 15sec block interval
    const scanFromBlock =
      currentBlock - Math.floor(this.minUpdateInterval / APPROXIMATED_BLOCK_INTERVAL)
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

    // Update if there is no recent event or if the latest one is more than minUpdateInterval old
    if (lastEvents.length === 0) {
      return true
    } else {
      const lastUpdateTimeOracleRelayer = (await lastEvents[0].getBlock()).timestamp
      return now().sub(lastUpdateTimeOracleRelayer).gte(this.minUpdateInterval)
    }
  }
}
