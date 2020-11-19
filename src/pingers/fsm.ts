import { BigNumber, ethers } from 'ethers'
import { contracts, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { now } from '../utils/time'

export class CoinFsmPinger {
  private fsm: contracts.Osm
  private rateSetter: contracts.RateSetter
  private transactor: Transactor
  constructor(
    osmAddress: string,
    rateSetterAddress: string,
    protected rewardReceiver: string,
    wallet: ethers.Signer,
    protected minUpdateInterval
  ) {
    this.transactor = new Transactor(wallet)
    this.fsm = this.transactor.getGebContract(contracts.Osm, osmAddress)
    this.rateSetter = this.transactor.getGebContract(contracts.RateSetter, rateSetterAddress)
  }

  public async ping() {
    let tx: TransactionRequest
    let didUpdateFsm = false
    let isAnyTransactionPending = await this.transactor.isAnyTransactionPending()

    // === Update RAI FSM ===

    // Check if it's too early to update or if there is pending transaction (Which means
    // that we need to re-execute the logic to submit a new transaction with an updated
    // gas price)
    const lastUpdatedTimeFsm = await this.fsm.lastUpdateTime()
    if (now().sub(lastUpdatedTimeFsm).gte(this.minUpdateInterval) || isAnyTransactionPending) {
      try {
        tx = this.fsm.updateResult()

        // Simulate call first to check if there are any expected errors
        await this.transactor.ethCall(tx)

        // Send transaction
        const hash = await this.transactor.ethSend(tx, true, BigNumber.from('200000'))
        didUpdateFsm = true
        console.log(`Update sent, transaction hash: ${hash}`)
      } catch (err) {
        if (
          typeof err == 'string' &&
          (err.startsWith('OSM/not-passed') || err.startsWith('DSM/not-passed'))
        ) {
          console.log('FSM not yet ready to be updated')
        } else {
          await notifier.sendError(`Unexpected error while simulating call: ${err}`)
        }
      }
    } else {
      console.log('To early to update fsm')
    }

    // === Update rate setter ===

    const lastUpdatedTimeRateSetter = await this.rateSetter.lastUpdateTime()
    if (
      now().sub(lastUpdatedTimeRateSetter).gte(this.minUpdateInterval) ||
      isAnyTransactionPending
    ) {
      try {
        // Pick a random seed, its value does not matter
        const seed = Math.floor(Math.random() * 4200) + 42
        tx = this.rateSetter.updateRate(seed, this.rewardReceiver)

        // Simulate transaction to check if there are any expected errors
        await this.transactor.ethCall(tx)

        // Send oracle relayer transaction
        // We force overwrite unless we just updated the FSM.
        const hash = await await this.transactor.ethSend(
          tx,
          !didUpdateFsm,
          BigNumber.from('400000')
        )
        console.log(`Rate setter update sent, transaction hash: ${hash}`)
      } catch (err) {
        if (typeof err == 'string' && err.startsWith('RateSetter/wait-more')) {
          // DSM was updated too recently, wait more.
          console.log('Rate setter not yet ready to be updated')
        } else {
          await notifier.sendError(`Unexpected error while simulating call: ${err}`)
        }
      }
    } else {
      console.log('To early to update rateSetter')
    }
  }
}

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
