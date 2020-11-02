import { ethers } from 'ethers'
import { contracts, TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'

export class CoinFsmPinger {
  private fsm: contracts.Osm
  private rateSetter: contracts.RateSetter
  private transactor: Transactor
  constructor(
    osmAddress: string,
    rateSetterAddress: string,
    protected rewardReceiver: string,
    wallet: ethers.Signer
  ) {
    this.transactor = new Transactor(wallet)
    this.fsm = this.transactor.getGebContract(contracts.Osm, osmAddress)
    this.rateSetter = this.transactor.getGebContract(contracts.RateSetter, rateSetterAddress)
  }

  public async ping() {
    let tx: TransactionRequest
    let didUpdateFsm = false

    // Simulate call
    try {
      tx = this.fsm.updateResult()
      await this.transactor.ethCall(tx)
      // Send transaction
      const hash = await this.transactor.ethSend(tx, false)
      didUpdateFsm = true
      console.log(`Update sent, transaction hash: ${hash}`)
    } catch (err) {
      if (err.startsWith('OSM/not-passed') || err.startsWith('DSM/not-passed')) {
        console.log('FSM not yet ready to be updated')
      } else {
        await notifier.sendError(`Unexpected error while simulating call: ${err}`)
      }
    }

    // Update rate setter
    if (
      didUpdateFsm ||
      (await this.fsm.lastUpdateTime()).gt(await this.rateSetter.lastUpdateTime())
    ) {
      // Only update rate setter if: We just updated the FSM OR the FSM update more recently than the rate setter.
      try {
        // Pick a random seed, its value does not matter
        const seed = Math.floor(Math.random() * 4200) + 42
        tx = this.rateSetter.updateRate(seed, this.rewardReceiver)
        await this.transactor.ethCall(tx)
      } catch (err) {
        if (err.startsWith('RateSetter/wait-more')) {
          console.log('Rate setter not yet ready to be updated')
        } else {
          await notifier.sendError(`Unexpected error while simulating call: ${err}`)
        }
        return
      }

      // Send oracle relayer transaction
      const hash = await await this.transactor.ethSend(tx, !didUpdateFsm)
      console.log(`Rate setter update sent, transaction hash: ${hash}`)
    } else {
      console.log(`Rate setter does not need to be updated`)
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
    wallet: ethers.Signer
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

    // Simulate call
    try {
      txFsm = this.fsm.updateResult()
      await this.transactor.ethCall(txFsm)
    } catch (err) {
      if (err.startsWith('OSM/not-passed') || err.startsWith('DSM/not-passed')) {
        console.log('FSM not yet ready to be updated')
      } else {
        await notifier.sendError(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Set the current nonce to be sure to overwrite the transaction from the previous run if
    // it's still pending
    txFsm.nonce = currentNonce

    // Send OSM transaction
    let hash = await this.transactor.ethSend(txFsm, true)
    console.log(`FSM update sent, transaction hash: ${hash}`)

    // Directly update the relayer after updating the OSM
    let txRelayer = this.oracleRelayer.updateCollateralPrice(this.collateralType)

    // Send oracle relayer transaction
    hash = await await this.transactor.ethSend(txRelayer, false)
    console.log(`Oracle relayer update sent, transaction hash: ${hash}`)
  }
}
