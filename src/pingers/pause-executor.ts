import { BigNumber, ethers } from 'ethers'
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

    const currentTimestamp = await this.transactor.getLatestBlockTimestamp()
    let currentNonce = await this.transactor.getNonce(await this.transactor.getWalletAddress())

    for (let proposal of proposals) {
      const fullHash = proposal.fullTransactionHash
      const isSchedule = await this.dsPause.scheduledTransactions(fullHash)

      if (!isSchedule) {
        notifier.sendError(
          `Transaction found in subgraph not scheduled on chain. Full hash: ${fullHash} target ${proposal.proposalTarget} description: ${proposal.transactionDescription}`
        )
        continue
      }

      const delays = await this.dsPause.getTransactionDelays2(
        proposal.proposalSender,
        proposal.codeHash,
        proposal.transactionData
      )
      const earliestExecTime = delays[1].add(delays[2])

      if (BigNumber.from(currentTimestamp).gte(earliestExecTime)) {
        // Execute proposal
        const tx = await this.dsPause.executeTransaction(
          proposal.proposalTarget,
          proposal.codeHash,
          proposal.transactionData,
          proposal.earliestExecutionTime
        )

        // Assign correct nonce
        tx.nonce = currentNonce

        // Simulate call first
        let hash: string
        try {
          hash = await this.transactor.ethCall(tx)
        } catch (err) {
          if ((err as string).startsWith('ds-protest-pause-delegatecall-error')) {
            // The proposal itself is failing, still send it with a high gas limit
            console.log(
              `Proposal with full hash: ${fullHash} target: ${proposal.proposalTarget} and description: ${proposal.transactionDescription} is a failing at execution.`
            )

            continue
          } else if ((err as string).startsWith('ds-protest-pause-expired-tx')) {
            // The proposal has expired
            console.log(
              `Proposal with full hash: ${fullHash} target: ${proposal.proposalTarget} and description: ${proposal.transactionDescription} has expired and can't be executed.`
            )

            continue
          }
        }

        hash = await this.transactor.ethSend(tx)
        console.log(`Executed proposal ${proposal.transactionDescription} Transaction hash ${hash}`)

        // Increment nonce for followup transactions
        currentNonce += 1
      } else {
        console.log(
          `Porposal scheduled with Full hash: ${fullHash} target ${proposal.proposalTarget} description: ${proposal.transactionDescription} but not yet ready to be executed.`
        )
      }
    }
  }
}
