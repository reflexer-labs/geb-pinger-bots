import { BigNumber, ethers } from 'ethers'
import { GebEthersProvider } from 'geb.js'
import { adminContracts } from '@reflexer-finance/geb-admin'
import { Transactor } from '../chains/transactor'
import { notifier } from '..'
import { fetchPendingProposals } from '../utils/subgraph'

export class PauseExecutor {
  private dsPause: adminContracts.DsProtestPause
  private transactor: Transactor

  constructor(
    dsPauseAddress: string,
    private wallet: ethers.Signer,
    private gebSubgraphUrl: string
  ) {
    const gebProvider = new GebEthersProvider(wallet.provider as ethers.providers.Provider)
    this.transactor = new Transactor(this.wallet)
    this.dsPause = new adminContracts.DsProtestPause(dsPauseAddress, gebProvider)
  }

  public async ping() {
    const proposals = await fetchPendingProposals(this.gebSubgraphUrl)
    console.log(`${proposals} pending found`)

    const provider = this.wallet.provider as ethers.providers.Provider
    const currentTimestamp = (await provider.getBlock('latest')).timestamp

    for (let proposal of proposals) {
      const fullHash = proposal.fullTransactionHash
      const isSchedule = await this.dsPause.scheduledTransactions(fullHash)

      if (!isSchedule) {
        notifier.sendAllChannels(
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

        // Simulate call first
        let hash: string
        try {
          hash = await this.transactor.ethCall(tx)
        } catch (err) {
          if ((err as string).startsWith('ds-protest-pause-delegatecall-error')) {
            // The proposal itself is failing, still send it with a high gas limit
            console.log(
              `Proposal with full hash: ${fullHash} target: ${proposal.proposalTarget} and description: ${proposal.transactionDescription} is a failing at execution`
            )

            continue
          }
        }

        hash = await this.transactor.ethSend(tx)
        console.log(`Executed proposal ${proposal.transactionDescription} Transaction hash ${hash}`)
      } else {
        console.log(
          `Porposal scheduled with Full hash: ${fullHash} target ${proposal.proposalTarget} description: ${proposal.transactionDescription} but not yet ready to be executed.`
        )
      }
    }
  }
}
