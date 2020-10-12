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
    } catch (err) {
      if (err.startsWith('OSM/not-passed') || err.startsWith('DSM/not-passed')) {
        console.log('FSM not yet ready to be updated')
      } else {
        await notifier.sendAllChannels(`Unknown error while simulating call: ${err}`)
      }
      return
    }

    // Send transaction
    let hash = await this.transactor.ethSend(tx)
    console.log(`Update sent, transaction hash: ${hash}`)

    // Update rate setter
    const seed = Math.floor(Math.random() * 4200) + 42
    tx = this.rateSetter.updateRate(seed, this.rewardReceiver)

    // Manually increment the nonce since the previous tx is still pending
    tx.nonce = currentNonce + 1

    // Send oracle relayer transaction
    hash = await await this.transactor.ethSend(tx)
    console.log(`Rate setter update sent, transaction hash: ${hash}`)
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
