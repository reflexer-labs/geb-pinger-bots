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
    private minUpdateInterval: number,
    private maxUpdateNoUpdateInterval: number,
    private minUpdateIntervalDeviation: number,
    private callBundlerAddress?: string
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

    if (await this.shouldUpdateFsm()) {
      // Simulate call
      let txFsm: TransactionRequest
      try {
        // Use the call bundler if available
        if (this.callBundlerAddress) {
          txFsm = await new ethers.Contract(this.callBundlerAddress, [
            'function updateOsmAndEthAOracleRelayer() external',
          ]).populateTransaction.updateOsmAndEthAOracleRelayer()
        } else {
          txFsm = this.fsm.updateResult()
        }
        await this.transactor.ethCall(txFsm)
      } catch (err) {
        if (
          typeof err == 'string' &&
          (err.startsWith('OSM/not-passed') ||
            err.startsWith('DSM/not-passed') ||
            err.startsWith('ExternallyFundedOSM/not-passed'))
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

    let shouldUpdateOracleRelayer = await this.shouldUpdateOracleRelayer()
    if (this.callBundlerAddress) {
      // If we're using the call bundler, no need to update the FSM unless we're late
      shouldUpdateOracleRelayer = shouldUpdateOracleRelayer && !didUpdateFsm
    } else {
      // Without call bundler we need to update the oracle relayer after a call to the fsm
      shouldUpdateOracleRelayer = shouldUpdateOracleRelayer || didUpdateFsm
    }

    // Update the OracleRelayer if we just updated a FSM OR if the relayer is stale
    if (shouldUpdateOracleRelayer) {
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

  // Evaluate wether we should update the FSM or not
  private async shouldUpdateFsm() {
    if (await this.transactor.isAnyTransactionPending()) {
      // A transaction from a previous run is pending and therefore needs a gas bump so we should update
      return true
    }
    const fsmLastUpdatedTime = await this.fsm.lastUpdateTime()
    const timeSinceLastUpdate = now().sub(fsmLastUpdatedTime)

    if (timeSinceLastUpdate.gte(this.maxUpdateNoUpdateInterval)) {
      // The fsm wasn't update in a very long time, more than the upper limit, update it now.
      return true
    } else if (timeSinceLastUpdate.lt(this.minUpdateInterval)) {
      // The fsm was update too recently, don't update.
      return false
    } else {
      // we're between minUpdateInterval and maxUpdateNoUpdateInterval update only if the price deviation is large (more than minUpdateIntervalDeviation %).
      const pendingFsmPrice = (await this.fsm.getNextResultWithValidity())[0] // RAY
      const priceSourceAddress = await this.fsm.priceSource()
      const priceRelayContract = this.transactor.getGebContract(
        contracts.ChainlinkRelayer,
        priceSourceAddress
      )
      const nextPendingFsmPrice = (await priceRelayContract.getResultWithValidity())[0] // RAY

      const priceDeviation = nextPendingFsmPrice
        .sub(pendingFsmPrice)
        .abs()
        .mul(utils.RAY)
        .div(pendingFsmPrice)

      // If the price deviation is larger than the threshold..
      if (utils.rayToFixed(priceDeviation).toUnsafeFloat() >= this.minUpdateIntervalDeviation) {
        return true
      } else {
        return false
      }
    }
  }

  // Check if the OracleRelayer needs to be updated by looking at the last update time
  private async shouldUpdateOracleRelayer() {
    const currentBlock = await this.transactor.getBlockNumber()

    // Get the latest OracleRelayer update events
    // Assume a 13sec block interval
    // Update if it has been more than the max OSM update interval + 30min
    // This is meant as a backup if somehow the piped update after the OSM one fails
    const scanFromBlock =
      currentBlock - Math.floor((this.maxUpdateNoUpdateInterval + 30) / APPROXIMATED_BLOCK_INTERVAL)
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
