import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'
import { StatusInfo, STATUS_KEY, Store } from '../utils/store'
import { fetchLastPeriodicRefresh } from '../utils/subgraph'

export class LivenessChecker {
  constructor(
    // [name, address, maxdelay, solidity function name (Optional)]
    private checks: [string, string, number, string?][],
    private provider: ethers.providers.Provider,
    private store: Store,
    private gebSubgraphUrl: string,
    private dsPauseAddress: string // private gnosisSafeAddress: string
  ) {}

  async check() {
    const networkName = (await this.provider.getNetwork()).name
    const currentStatus = await this.store.getJson(STATUS_KEY)

    // Prepare the results object
    let newStatus: StatusInfo = {
      [networkName]: {
        timestamp: Math.floor(Date.now() / 1000),
        lastBlock: await this.provider.getBlockNumber(),
        status: {},
        lastUpdated: {},
      },
    }

    // Check the lastUpdated status of all contracts
    for (let check of this.checks) {
      const contractName = check[0]
      newStatus[networkName].status[contractName] = false
      const functionName = (check.length === 3 ? 'lastUpdateTime' : check[3]) as string
      const contract = new ethers.Contract(
        check[1],
        [`function ${functionName}() view returns (uint256)`],
        this.provider
      )

      let lastUpdated: BigNumber
      try {
        lastUpdated = await contract[functionName]()
      } catch (err) {
        console.log(err)
        await notifier.sendAllChannels(
          `Could not fetch last update Time for liveness check of ${contractName}`
        )
        continue
      }
      newStatus[networkName].lastUpdated[contractName] = lastUpdated.toNumber()
      const timSinceLastUpdate = BigNumber.from(Math.floor(Date.now() / 1000)).sub(lastUpdated)
      if (timSinceLastUpdate.gt(check[2] * 60)) {
        await notifier.sendAllChannels(
          `${contractName} at address ${
            check[1]
          } could not be updated for more than ${timSinceLastUpdate.div(60).toString()}min`
        )
      } else {
        newStatus[networkName].status[contractName] = true
      }
    }

    // Check that the graph node is not 2 hours behind
    let lastPeriodicRefresh = await fetchLastPeriodicRefresh(this.gebSubgraphUrl)
    newStatus[networkName].lastUpdated['graph_node_last_periodic_refresh'] = lastPeriodicRefresh
    let now = Math.floor(Date.now() / 1000)
    if (now - lastPeriodicRefresh > 3600 * 2) {
      await notifier.sendAllChannels(
        `Graph node at ${
          this.gebSubgraphUrl
        } might be out of sync, last periodic update on ${new Date(
          lastPeriodicRefresh
        ).toUTCString()}`
      )
    }

    // Check if we should notify about new ds pause proposal
    const dsPauseEventAbi = [
      'event ScheduleTransaction(address sender, address usr, bytes32 codeHash, bytes parameters, uint earliestExecutionTime)',
      'event ExecuteTransaction(address sender, address usr, bytes32 codeHash, bytes parameters, uint earliestExecutionTime)',
    ]

    // Look for ScheduleTransaction event
    const dsPauseContract = new ethers.Contract(this.dsPauseAddress, dsPauseEventAbi, this.provider)
    let dsPauseFilter = dsPauseContract.filters.ScheduleTransaction()
    let dsPauseEvents = await dsPauseContract.queryFilter(
      dsPauseFilter,
      currentStatus[networkName].lastBlock || newStatus[networkName].lastBlock, // If there is no last block, just don't fetch anything
      newStatus[networkName].lastBlock
    )

    dsPauseEvents.map((e) => {
      const args = e.args as ethers.utils.Result
      return notifier.sendAllChannels(
        `New pending proposal scheduled in ds-pause. Target ${args.usr} parameters: ${args.parameters} earliest execution time ${args.earliestExecutionTime} codeHash: ${args.codeHash}`
      )
    })

    // Look for ExecuteTransaction event
    dsPauseFilter = dsPauseContract.filters.ExecuteTransaction()
    dsPauseEvents = await dsPauseContract.queryFilter(
      dsPauseFilter,
      currentStatus[networkName].lastBlock || newStatus[networkName].lastBlock, // If there is no last block, just don't fetch anything
      newStatus[networkName].lastBlock
    )

    dsPauseEvents.map((e) => {
      const args = e.args as ethers.utils.Result
      return notifier.sendAllChannels(
        `Pending proposal executed. Target ${args.usr} parameters: ${args.parameters} earliest execution time ${args.earliestExecutionTime} codeHash: ${args.codeHash}`
      )
    })

    // Check if we should notify about Gnosis safe
    // const safeEventAbi = []

    // const safeContract = new ethers.Contract(this.gnosisSafeAddress, safeEventAbi, this.provider)
    // let safeFilter = safeContract.filters.ScheduleTransaction()
    // let safeEvents = await safeContract.queryFilter(
    //   safeFilter,
    //   currentStatus[networkName].lastBlock || newStatus[networkName].lastBlock, // If there is no last block, just don't fetch anything
    //   newStatus[networkName].lastBlock
    // )

    // safeEvents.map((e) => {
    //   const args = e.args as ethers.utils.Result
    //   return notifier.sendAllChannels(`New gnosis safe transaction.`)
    // })

    // Store the results in S3
    await this.store.mergedPutJson(STATUS_KEY, newStatus)
  }
}
