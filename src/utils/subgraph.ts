import Axios from 'axios'
import { notifier } from '..'

const graphQlQuery = async (url: string, query: string) => {
  try {
    const resp = await Axios.post(url, {
      query,
    })
    return resp.data.data
  } catch (err) {
    const message = `Error querying graph node: ${err}`
    notifier.sendAllChannels(message)
    throw new Error(message)
  }
}

type ProposalQueryData = {
  codeHash: string
  earliestExecutionTime: string
  proposalSender: string
  proposalTarget: string
  fullTransactionHash: string
  transactionData: string
  transactionDescription: string
  createdAt: string
}

export const fetchRecentProposals = async (gebSubgraphUrl: string, since: number) => {
  const query = `{
    dsPauseScheduledTransactions(where: {createdAt_gte: ${since.toString()} }){
    proposalSender
    proposalTarget
    codeHash
    transactionData
    fullTransactionHash
    earliestExecutionTime
    transactionDescription
    createdAt
    }
  }`

  const resp = await graphQlQuery(gebSubgraphUrl, query)

  return (await resp.dsPauseScheduledTransactions) as ProposalQueryData[]
}

export const fetchPendingProposals = async (gebSubgraphUrl: string) => {
  const query = `{
    dsPauseScheduledTransactions(where: {executed: false}){
    proposalSender
    proposalTarget
    codeHash
    transactionData
    fullTransactionHash
    earliestExecutionTime
    transactionDescription
    createdAt
    }
  }`

  const resp = await graphQlQuery(gebSubgraphUrl, query)

  return (await resp.dsPauseScheduledTransactions) as ProposalQueryData[]
}

export const fetchLastPeriodicRefresh = async (gebSubgraphUrl: string) => {
  const query = `{
    systemState(id: "current") {
      lastPeriodicUpdate
    }
  }`

  const resp = await graphQlQuery(gebSubgraphUrl, query)

  return parseInt(await resp.systemState.lastPeriodicUpdate)
}

export const fetchAuctionsTimestamps = async (gebSubgraphUrl: string, since: number) => {
  const query = `{
    fixedDiscountAuctions(where: {createdAt_gte: ${since}}) {
      createdAt
    }
  }`

  const resp = (await graphQlQuery(gebSubgraphUrl, query)).fixedDiscountAuctions as string[]
  return resp.map((x) => parseInt(x))
}
