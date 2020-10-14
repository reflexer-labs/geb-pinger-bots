import { ethers } from 'ethers'
import { contracts, GebEthersProvider, TransactionRequest } from 'geb.js'
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
    protected wallet: ethers.Signer
  ) {
    const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
    this.fsm = new contracts.Osm(osmAddress, gebProvider)
    this.rateSetter = new contracts.RateSetter(rateSetterAddress, gebProvider)
    this.transactor = new Transactor(wallet)
  }

  public async ping() {
    let tx: TransactionRequest
    let didUpdateFsm = false

    // Save the current nonce
    const provider = this.wallet.provider as ethers.providers.Provider
    const currentNonce = await provider.getTransactionCount(
      await this.wallet.getAddress(),
      'latest'
    )

    // Simulate call
    try {
      tx = this.fsm.updateResult()
      await this.transactor.ethCall(tx)
      // Send transaction
      const hash = await this.transactor.ethSend(tx)
      didUpdateFsm = true
      console.log(`Update sent, transaction hash: ${hash}`)
    } catch (err) {
      if (err.startsWith('OSM/not-passed') || err.startsWith('DSM/not-passed')) {
        console.log('FSM not yet ready to be updated')
      } else {
        await notifier.sendAllChannels(`Unexpected error while simulating call: ${err}`)
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
          await notifier.sendAllChannels(`Unexpected error while simulating call: ${err}`)
        }
        return
      }

      if (didUpdateFsm) {
        // Manually increment the nonce since the previous tx is still pending
        tx.nonce = currentNonce + 1
      }

      // Send oracle relayer transaction
      const hash = await await this.transactor.ethSend(tx)
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
    private wallet: ethers.Signer
  ) {
    const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
    this.fsm = new contracts.Osm(osmAddress, gebProvider)
    this.oracleRelayer = new contracts.OracleRelayer(oracleRelayerAddress, gebProvider)
    this.transactor = new Transactor(wallet)
  }

  public async ping() {
    let txFsm: TransactionRequest

    // Save the current nonce
    const provider = this.wallet.provider as ethers.providers.Provider
    const currentNonce = await provider.getTransactionCount(
      await this.wallet.getAddress(),
      'latest'
    )

    // Simulate call
    try {
      txFsm = this.fsm.updateResult()
      await this.transactor.ethCall(txFsm)
    } catch (err) {
      if (err.startsWith('OSM/not-passed') || err.startsWith('DSM/not-passed')) {
        console.log('FSM not yet ready to be updated')
      } else {
        await notifier.sendAllChannels(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send OSM transaction
    let hash = await this.transactor.ethSend(txFsm)
    console.log(`FSM update sent, transaction hash: ${hash}`)

    // Directly update the relayer after updating the OSM
    let txRelayer = this.oracleRelayer.updateCollateralPrice(this.collateralType)

    // Manually increment the nonce since the previous tx is still pending
    txRelayer.nonce = currentNonce + 1

    // Send oracle relayer transaction
    hash = await await this.transactor.ethSend(txRelayer)
    console.log(`Oracle relayer update sent, transaction hash: ${hash}`)
  }
}
