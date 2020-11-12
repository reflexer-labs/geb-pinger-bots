import Axios from 'axios'
import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { StatusInfo, STATUS_KEY, Store } from '../utils/store'
import { fetchLastPeriodicRefresh } from '../utils/subgraph'

export class LivenessChecker {
  private transactor: Transactor
  constructor(
    // [name, address, maxdelay, solidity function name (Optional)]
    private checks: [string, string, number, string?][],
    provider: ethers.providers.Provider,
    private store: Store,
    private gebSubgraphUrl: string,
    private dsPauseAddress: string,
    private gnosisSafeAddress: string
  ) {
    this.transactor = new Transactor(provider)
  }

  async check() {
    console.log(`Pinger public IP: ${(await Axios.get('https://ipecho.net/plain')).data}`)

    const networkName = await this.transactor.getNetworkName()
    const currentStatus = await this.store.getJson(STATUS_KEY)

    // Prepare the results object
    let newStatus: StatusInfo = {
      [networkName]: {
        timestamp: Math.floor(Date.now() / 1000),
        lastBlock: await this.transactor.getBlockNumber(),
        status: {},
        lastUpdated: {},
      },
    }

    // --- Contract call based notifications ---

    // Check the lastUpdated status of all contracts
    for (let check of this.checks) {
      const contractName = check[0]
      newStatus[networkName].status[contractName] = false
      const functionName = (check.length === 3 ? 'lastUpdateTime' : check[3]) as string

      let lastUpdated: BigNumber
      try {
        lastUpdated = await this.transactor.callContractFunciton(
          `function ${functionName}() view returns (uint256)`,
          check[1]
        )
      } catch (err) {
        console.log(err)
        await notifier.sendError(
          `Could not fetch last update Time for liveness check of ${contractName}`
        )
        continue
      }
      newStatus[networkName].lastUpdated[contractName] = lastUpdated.toNumber()
      const timSinceLastUpdate = BigNumber.from(Math.floor(Date.now() / 1000)).sub(lastUpdated)
      if (timSinceLastUpdate.gt(check[2] * 60)) {
        await notifier.sendError(
          `${contractName} at address ${
            check[1]
          } could not be updated for more than ${timSinceLastUpdate.div(60).toString()}min`
        )
      } else {
        newStatus[networkName].status[contractName] = true
      }
    }

    // --- Graph based notifications ---

    // Check that the graph nodes are responding and less 2 hours behind
    const urls = this.gebSubgraphUrl.split(',')
    for (let url of urls) {
      let lastPeriodicRefresh: number
      try {
        lastPeriodicRefresh = await fetchLastPeriodicRefresh(url)
      } catch (err) {
        await notifier.sendError(`Graph node at ${url} query error: ${err}`)
        continue
      }

      newStatus[networkName].lastUpdated['graph_node_last_periodic_refresh'] = lastPeriodicRefresh
      let now = Math.floor(Date.now() / 1000)
      if (now - lastPeriodicRefresh > 3600 * 2) {
        await notifier.sendError(
          `Graph node at ${url} might be out of sync, last periodic update on ${new Date(
            lastPeriodicRefresh * 1000
          ).toUTCString()}`
        )
      }
    }

    // --- Event based notifications ---

    // Block range for event filter
    const fromBlock = currentStatus[networkName]?.lastBlock || newStatus[networkName].lastBlock
    const toBlock = newStatus[networkName].lastBlock

    // ABIs
    const dsPauseEventAbi = [
      'event ScheduleTransaction(address sender, address usr, bytes32 codeHash, bytes parameters, uint earliestExecutionTime)',
      'event ExecuteTransaction(address sender, address usr, bytes32 codeHash, bytes parameters, uint earliestExecutionTime)',
    ]
    const gnosisSafeAbi = [
      'event ExecutionSuccess(bytes32 txHash, uint256 payment)',
      'event ExecutionFailure(bytes32 txHash, uint256 payment)',
    ]

    // Look for DsPause ScheduleTransaction events
    let event = await this.transactor.getContractEvents(
      dsPauseEventAbi[0],
      this.dsPauseAddress,
      fromBlock,
      toBlock
    )

    event.map((e) => {
      const args = e.args as ethers.utils.Result
      return notifier.sendMultisigMessage(
        `New pending proposal scheduled in ds-pause. Target ${args.usr} parameters: ${args.parameters} earliest execution time ${args.earliestExecutionTime} codeHash: ${args.codeHash}`
      )
    })

    // Look for DsPause ExecuteTransaction events
    event = await this.transactor.getContractEvents(
      dsPauseEventAbi[1],
      this.dsPauseAddress,
      fromBlock,
      toBlock
    )

    event.map((e) => {
      const args = e.args as ethers.utils.Result
      return notifier.sendMultisigMessage(
        `Pending proposal executed. Target ${args.usr} parameters: ${args.parameters} earliest execution time ${args.earliestExecutionTime} codeHash: ${args.codeHash}`
      )
    })

    // Look for GnosisSafe ExecutionSuccess events
    event = await this.transactor.getContractEvents(
      gnosisSafeAbi[0],
      this.gnosisSafeAddress,
      fromBlock,
      toBlock
    )

    event.map((e) => {
      const args = e.args as ethers.utils.Result
      return notifier.sendMultisigMessage(
        `New gnosis safe transaction success, tx hash: ${args.txHash}`
      )
    })

    // Look for GnosisSafe ExecutionFailure events
    event = await this.transactor.getContractEvents(
      gnosisSafeAbi[1],
      this.gnosisSafeAddress,
      fromBlock,
      toBlock
    )

    event.map((e) => {
      const args = e.args as ethers.utils.Result
      return notifier.sendMultisigMessage(
        `Gnosis safe transaction failure, tx hash: ${args.txHash}`
      )
    })

    // Store the results in S3
    await this.store.mergedPutJson(STATUS_KEY, newStatus)
  }
}
