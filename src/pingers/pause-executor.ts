import { BigNumber, ethers } from 'ethers'
import { GebEthersProvider } from 'geb.js'
import { adminContracts } from '@reflexer-finance/geb-admin'
import { Transactor } from '../chains/transactor'
import { notifier } from '..'
import { graphQlQuery } from '../utils/subgraph'

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

  private async fetchPendingProposals() {
    const query = `{
      dsPauseScheduledTransactions(where: {executed: false}){
      proposalSender
      proposalTarget
      codeHash
      transactionData
      earliestExecutionTime
      transactionDescription
      }
    }`

    const resp = await graphQlQuery(this.gebSubgraphUrl, query)

    type ProposalQueryData = {
      codeHash: string
      earliestExecutionTime: string
      proposalSender: string
      proposalTarget: string
      transactionData: string
      transactionDescription: string
    }

    return (await resp.dsPauseScheduledTransactions) as ProposalQueryData[]
  }

  public async ping() {
    const proposals = await this.fetchPendingProposals()
    const provider = this.wallet.provider as ethers.providers.Provider
    const currentTimestamp = (await provider.getBlock('latest')).timestamp

    for (let proposal of proposals) {
      const fullHash = await this.dsPause.getTransactionDataHash2(
        proposal.proposalSender,
        proposal.codeHash,
        proposal.transactionData,
        proposal.earliestExecutionTime
      )

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
          proposal.proposalSender,
          proposal.codeHash,
          proposal.transactionData,
          proposal.earliestExecutionTime
        )

        const hash = await this.transactor.ethSend(tx)
        console.log(`Executed proposal ${proposal.transactionDescription} Transaction hash ${hash}`)
      }
    }
  }
}
