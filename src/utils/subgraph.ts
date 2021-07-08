import Axios from 'axios'
import { notifier } from '..'

export const postQuery = async (host: string, query: string) => {
  const resp = await Axios.post(host, {
    query,
    timeout: 6000,
  })

  // The graph node can return empty data which
  // means that the node is not ok
  if (!resp.data || !resp.data.data) {
    throw 'No data'
  }

  return resp.data.data
}

const graphQlQueryWithFallback = async (urls: string[], query: string) => {
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

export const fetchRecentProposals = async (gebSubgraphUrls: string[], since: number) => {
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

  const resp = await graphQlQueryWithFallback(gebSubgraphUrls, query)

  return (await resp.dsPauseScheduledTransactions) as ProposalQueryData[]
}

export const fetchPendingProposals = async (gebSubgraphUrls: string[]) => {
  const query = `{
    dsPauseScheduledTransactions(where: {executed: false, abandoned: false}){
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

  const resp = await graphQlQueryWithFallback(gebSubgraphUrls, query)

  return (await resp.dsPauseScheduledTransactions) as ProposalQueryData[]
}

export const fetchGlobalDebt = async (gebSubgraphUrl: string) => {
  const query = `{
    systemState(id: "current") {
      globalDebt
    }
  }`

  const resp = await postQuery(gebSubgraphUrl, query)

  if (!resp || !resp.systemState || !resp.systemState.globalDebt) {
    throw Error('globalDebt, null graph data')
  }

  return parseInt(await resp.systemState.globalDebt)
}

export const fetchAuctionsTimestamps = async (gebSubgraphUrls: string[], since: number) => {
  const query = `{
    discountAuctions(where: {createdAt_gte: ${since}}, first: 1000) {
      createdAt
    }
  }`

  const resp = (await graphQlQueryWithFallback(gebSubgraphUrls, query)).discountAuctions as {
    createdAt: string
  }[]
  return resp.map((x) => parseInt(x.createdAt))
}

export const fetchAdminSyncedBlockNumber = async (gebSubgraphUrl: string) => {
  // Dummy query that will return an error telling up to which block we are synced
  const query = `
{
    systemStates(block: {number: 999999999}) {
        id
    }
}
  `
  const prom = Axios.post(gebSubgraphUrl, {
    query,
  })

  let resp: any
  try {
    resp = await prom
  } catch (err) {
    throw Error('Error with fetching synced block number: ' + err)
  }
  const errorMessage = resp.data.errors[0].message

  // Extract the last synced block form the error message
  const block = Number(errorMessage.match(/indexed up to block number ([0-9]*)/)[1])
  return block
}
