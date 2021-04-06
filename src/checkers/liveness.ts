import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { MAX_GRAPH_NODE_BLOCK_DELAY } from '../utils/constants'
import { StatusInfo, STATUS_KEY, Store } from '../utils/store'
import { fetchAdminSyncedBlockNumber, fetchGlobalDebt } from '../utils/subgraph'
import { now } from '../utils/time'

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
        if (contractName === 'tax_collector') {
          // Tax collector has a different way to check the updated time
          lastUpdated = (
            await this.transactor.callContractFunciton(
              `function collateralTypes(bytes32) view returns (uint256,uint256)`,
              check[1], // Contract address
              [check[3]] // Pass the collateral type
            )
          )[1] // Get the second element with the updateTime
        } else {
          lastUpdated = await this.transactor.callContractFunciton(
            `function ${functionName}() view returns (uint256)`,
            check[1] // Contract address
          )
        }
      } catch (err) {
        await notifier.sendError(
          `Could not fetch last update Time for liveness check of ${contractName}`
        )
        continue
      }
      newStatus[networkName].lastUpdated[contractName] = lastUpdated.toNumber()
      const timSinceLastUpdate = now().sub(lastUpdated)
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

    const urls = this.gebSubgraphUrl.split(',')
    // For each subgraph URL check two things: (i) the server responds, (ii) the sync block is not too far in the past
    for (let url of urls) {
      // (i)
      try {
        let globalDebt = await fetchGlobalDebt(url)

        if (!globalDebt) {
          throw 'Null global debt'
        }
      } catch (err) {
        await notifier.sendError(`Graph node at ${url} query error: ${err}`)
        continue
      }

      // (ii)
      let graphNodeSyncedBlock: number
      try {
        // !! To call this function you need to have access to the port 8030 of the graph if self hosted (to be configured on the cloud provider)
        graphNodeSyncedBlock = await fetchAdminSyncedBlockNumber(url)
      } catch (err) {
        notifier.sendError(`Graph node at ${url} could not fetch synced block: ${err}`)
        continue
      }

      const ethNodeBlock = await this.transactor.getBlockNumber()

      if (graphNodeSyncedBlock + MAX_GRAPH_NODE_BLOCK_DELAY < ethNodeBlock) {
        notifier.sendError(
          `The Graph node at ${url} is behind the chain. Last subgraph synced block: ${graphNodeSyncedBlock}. ETH node synced block: ${ethNodeBlock}`
        )
      }

      newStatus[networkName].lastUpdated['graph_node_synced_block'] = graphNodeSyncedBlock
    }

    // --- Event based notifications ---

    // Block range for the event filter
    const fromBlock = currentStatus[networkName]?.lastBlock || newStatus[networkName].lastBlock
    const toBlock = newStatus[networkName].lastBlock

    // ABIs
    const dsPauseEventAbi = [
      'event ScheduleTransaction(address sender, address usr, bytes32 codeHash, bytes parameters, uint earliestExecutionTime)',
    ]
    const gnosisSafeAbi = [
      'event ExecutionSuccess(bytes32 txHash, uint256 payment)',
      'event ExecutionFailure(bytes32 txHash, uint256 payment)',
    ]

    // Look for DsPause ScheduleTransaction events
    let events = await this.transactor.getContractEvents(
      dsPauseEventAbi[0],
      this.dsPauseAddress,
      fromBlock,
      toBlock
    )

    events.map((e) => {
      const args = e.args as ethers.utils.Result
      return notifier.sendMultisigMessage(
        `New pending proposal scheduled in ds-pause. Target ${args.usr} parameters: ${args.parameters} earliest execution time ${args.earliestExecutionTime}`
      )
    })

    // Look for GnosisSafe ExecutionSuccess events
    events = await this.transactor.getContractEvents(
      gnosisSafeAbi[0],
      this.gnosisSafeAddress,
      fromBlock,
      toBlock
    )

    events.map((e) => {
      return notifier.sendMultisigMessage(
        `New gnosis safe transaction success, tx hash: ${e.transactionHash}`
      )
    })

    // Look for GnosisSafe ExecutionFailure events
    events = await this.transactor.getContractEvents(
      gnosisSafeAbi[1],
      this.gnosisSafeAddress,
      fromBlock,
      toBlock
    )

    events.map((e) => {
      return notifier.sendMultisigMessage(
        `Gnosis safe transaction failure, tx hash: ${e.transactionHash}`
      )
    })

    // Check all eth nodes
    await this.transactor.checkNodes()

    // Store the results in S3
    await this.store.mergedPutJson(STATUS_KEY, newStatus)
  }
}
