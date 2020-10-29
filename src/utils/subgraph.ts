import Axios from 'axios'
import { notifier } from '..'

export const postQuery = async (host: string, query: string) => {
  const resp = await Axios.post(host, {
    query,
  })

  // The graph node can return empty data which
  // means that the node is not ok.
  if (!resp.data || !resp.data.data) {
    throw 'No data'
  }

  return resp.data.data
}

const graphQlQueryWithFallback = async (url: string, query: string) => {
  const urls = url.split(',')

  try {
    return await postQuery(urls[0], query)
  } catch (errPrimary) {
    let message = `Error querying graph node, primary node error ${errPrimary}`
    console.log(errPrimary)

    // If we have a second node, try querying it.
    if (urls.length >= 2) {
      try {
        return await postQuery(urls[1], query)
      } catch (errSecondary) {
        message += ` Secondary node error ${errSecondary}`
      }
    } else {
      message += ' No secondary node provided'
    }

    notifier.sendError(message)
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

  const resp = await graphQlQueryWithFallback(gebSubgraphUrl, query)

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

  const resp = await graphQlQueryWithFallback(gebSubgraphUrl, query)

  return (await resp.dsPauseScheduledTransactions) as ProposalQueryData[]
}

export const fetchLastPeriodicRefresh = async (gebSubgraphUrl: string) => {
  const query = `{
    systemState(id: "current") {
      lastPeriodicUpdate
    }
  }`

  const resp = await postQuery(gebSubgraphUrl, query)

  if (!resp || !resp.systemState || !resp.systemState.lastPeriodicUpdate) {
    throw Error('fetchLastPeriodicRefresh, null graph data')
  }

  return parseInt(await resp.systemState.lastPeriodicUpdate)
}

export const fetchAuctionsTimestamps = async (gebSubgraphUrl: string, since: number) => {
  const query = `{
    fixedDiscountAuctions(where: {createdAt_gte: ${since}}) {
      createdAt
    }
  }`

  const resp = (await graphQlQueryWithFallback(gebSubgraphUrl, query)).fixedDiscountAuctions as {
    createdAt: string
  }[]
  return resp.map((x) => parseInt(x.createdAt))
}
