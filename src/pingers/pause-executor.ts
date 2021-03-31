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

    // We will force an override for the first proposal executions in case some transactions are pending from the previous run
    let override = true

    for (let proposal of proposals) {
      const fullHash = proposal.fullTransactionHash
      const isSchedule = await this.dsPause.scheduledTransactions(fullHash)

      if (!isSchedule) {
        notifier.sendError(
          `Transaction found in subgraph not scheduled on chain. Full hash: ${fullHash}, target ${proposal.proposalTarget}, description: "${proposal.transactionDescription}"`
        )
        continue
      }

      // Prepare a transaction
      const tx = await this.dsPause.executeTransaction(
        proposal.proposalTarget,
        proposal.codeHash,
        proposal.transactionData,
        proposal.earliestExecutionTime
      )

      // Simulate the call and handle potential errors
      let hash: string
      try {
        hash = await this.transactor.ethCall(tx)
      } catch (err) {
        if ((err as string).startsWith('ds-protest-pause-delegatecall-error')) {
          // The proposal itself is failing
          console.log(
            `Proposal with full hash: ${fullHash} target: ${proposal.proposalTarget} and description: "${proposal.transactionDescription}" is a failing at execution.`
          )
        } else if ((err as string).startsWith('ds-protest-pause-expired-tx')) {
          // The proposal has expired
          console.log(
            `Proposal with full hash: ${fullHash} target: ${proposal.proposalTarget} and description: "${proposal.transactionDescription}" has expired and can't be executed.`
          )
        } else if ((err as string).startsWith('ds-protest-pause-premature-exec')) {
          // We need to wait more to execute the transaction
          console.log(
            `Proposal scheduled with Full hash: ${fullHash} target ${proposal.proposalTarget} description: "${proposal.transactionDescription}" but not yet ready to be executed.`
          )
        } else {
          notifier.sendError(`Unexpected transaction execution error: ${err}`)
        }

        continue
      }
      // !! Overriding here is a bit risky since we might override a different transaction
      hash = await this.transactor.ethSend(tx, override)
      override = false
      notifier.sendMultisigMessage(
        `Executed a proposal in DsPause with the description: "${proposal.transactionDescription}". \n Transaction hash ${hash}`
      )
    }
  }
}
