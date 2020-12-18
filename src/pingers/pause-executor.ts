import { ethers } from 'ethers'
import { adminContracts } from '@reflexer-finance/geb-admin'
import { Transactor } from '../chains/transactor'
import { notifier } from '..'
import { fetchPendingProposals } from '../utils/subgraph'

export class PauseExecutor {
  private dsPause: adminContracts.DsProtestPause
  private transactor: Transactor

  constructor(dsPauseAddress: string, wallet: ethers.Signer, private gebSubgraphUrl: string) {
    this.transactor = new Transactor(wallet)
    this.dsPause = this.transactor.getGebContract(adminContracts.DsProtestPause, dsPauseAddress)
  }

  public async ping() {
    const proposals = await fetchPendingProposals(this.gebSubgraphUrl)
    console.log(`${proposals.length} pending found`)

    for (let proposal of proposals) {
      const fullHash = proposal.fullTransactionHash
      const isSchedule = await this.dsPause.scheduledTransactions(fullHash)

      if (!isSchedule) {
        notifier.sendError(
          `Transaction found in subgraph not scheduled on chain. Full hash: ${fullHash} target ${proposal.proposalTarget} description: ${proposal.transactionDescription}`
        )
        continue
      }

      // Prepare transaction
      const tx = await this.dsPause.executeTransaction(
        proposal.proposalTarget,
        proposal.codeHash,
        proposal.transactionData,
        proposal.earliestExecutionTime
      )

      // Simulate call and handle potential errors
      let hash: string
      try {
        hash = await this.transactor.ethCall(tx)
      } catch (err) {
        if ((err as string).startsWith('ds-protest-pause-delegatecall-error')) {
          // The proposal itself is failing
          notifier.sendError(
            `Proposal with full hash: ${fullHash} target: ${proposal.proposalTarget} and description: ${proposal.transactionDescription} is a failing at execution.`
          )
        } else if ((err as string).startsWith('ds-protest-pause-expired-tx')) {
          // The proposal has expired
          console.log(
            `Proposal with full hash: ${fullHash} target: ${proposal.proposalTarget} and description: ${proposal.transactionDescription} has expired and can't be executed.`
          )
        } else if ((err as string).startsWith('ds-protest-pause-premature-exec')) {
          // We need to wait more to execute the transaction
          console.log(
            `Porposal scheduled with Full hash: ${fullHash} target ${proposal.proposalTarget} description: ${proposal.transactionDescription} but not yet ready to be executed.`
          )
        } else {
          notifier.sendError(`Unexpected transaction execution error: ${err}`)
        }

        continue
      }
      // !! Overriding here is a bit risky since we might override a different transaction.
      hash = await this.transactor.ethSend(tx, true)
      console.log(`Executed proposal ${proposal.transactionDescription} Transaction hash ${hash}`)
    }
  }
}
