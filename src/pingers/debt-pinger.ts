import { contracts } from '@reflexer-finance/geb-admin'
import { BigNumber, ethers } from 'ethers'
import { Transactor } from '../chains/transactor'
import { fetchAuctionsTimestamps } from '../utils/subgraph'

export class DebtSettler {
  private accountingEngine: contracts.AccountingEngine
  private safeEngine: contracts.SafeEngine
  private transactor: Transactor

  constructor(
    private accountingEngineAddress: string,
    safeEngineAddress: string,
    wallet: ethers.Signer,
    private gebSubgraphUrl: string
  ) {
    this.transactor = new Transactor(wallet)
    this.accountingEngine = this.transactor.getGebContract(
      contracts.AccountingEngine,
      accountingEngineAddress
    )
    this.safeEngine = this.transactor.getGebContract(contracts.SafeEngine, safeEngineAddress)
  }

  public async ping() {
    const popDelay = await this.accountingEngine.popDebtDelay()
    const now = await this.transactor.getLatestBlockTimestamp()
    let didSendAPopDebt = false

    // Fetch auctions from 2 last days + popDelay
    let auctionTimestamps = await fetchAuctionsTimestamps(
      this.gebSubgraphUrl,
      now - popDelay.toNumber() - 3600 * 48
    )

    // Remove duplicated timestamps since popDebtFromQueue needs to be called only once for all auctions created in a single block
    auctionTimestamps = [...new Set(auctionTimestamps)]

    let unqueuedDebt = BigNumber.from(0)
    for (let auctionTimestamp of auctionTimestamps) {
      if (now > auctionTimestamp + popDelay.toNumber()) {
        // The pop delay period for the auction has passed. Check if it wasn't already unqueued
        const debt = await this.accountingEngine.debtQueue(auctionTimestamp)
        if (debt.gt(0)) {
          // There is debt ready to be unqueued, send the transaction
          const tx = this.accountingEngine.popDebtFromQueue(auctionTimestamp)
          const hash = await this.transactor.ethSend(tx, false)
          didSendAPopDebt = true
          unqueuedDebt = unqueuedDebt.add(debt)
          console.log(
            `Call popDebtFromQueue for timestamp ${auctionTimestamp} transaction hash ${hash}`
          )
        }
      }
    }

    // Calculation of the amount to settle
    let settleAmount: BigNumber
    if (!unqueuedDebt.isZero()) {
      // If we just popped something, settle that amount
      settleAmount = unqueuedDebt
    } else {
      // Otherwise just settle the max that can be settled (maybe nothing)
      const surplus = await this.safeEngine.coinBalance(this.accountingEngineAddress)
      const unqueuedUnauctionedDebt = await this.accountingEngine.unqueuedUnauctionedDebt()
      const min = surplus.gt(unqueuedUnauctionedDebt) ? unqueuedUnauctionedDebt : surplus
      settleAmount = min
    }

    if (settleAmount.gt(0)) {
      const tx = this.accountingEngine.settleDebt(settleAmount)
      const hash = await this.transactor.ethSend(tx, !didSendAPopDebt, BigNumber.from('200000'))
      console.log(
        `Called settle debt for ${settleAmount.toString()} of debt. Transaction hash ${hash}`
      )
    }
  }
}
