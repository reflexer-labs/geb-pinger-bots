import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'
import { MAX_GRAPH_NODE_BLOCK_DELAY } from '../utils/constants'
import { fetchAdminSyncedBlockNumber, fetchGlobalDebt } from '../utils/subgraph'
import { now } from '../utils/time'

export class LivenessChecker {
  private transactor: Transactor
  constructor(
    // [name, address, maxdelay, solidity function name (Optional)]
    private checks: [string, string, number, string?][],
    provider: ethers.providers.Provider,
    private gebSubgraphUrls: string[]
  ) {
    this.transactor = new Transactor(provider)
  }

  async check() {
    // --- Contract call based notifications ---

    // Check the lastUpdated status of all contracts
    for (let check of this.checks) {
      const contractName = check[0]
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
      const timSinceLastUpdate = now().sub(lastUpdated)
      if (timSinceLastUpdate.gt(check[2] * 60)) {
        await notifier.sendError(
          `${contractName} at address ${
            check[1]
          } could not be updated for more than ${timSinceLastUpdate.div(60).toString()}min`
        )
      } else {
      }
    }

    // --- Graph based notifications ---

    // For each subgraph URL check two things: (i) the server responds, (ii) the sync block is not too far in the past
    for (let url of this.gebSubgraphUrls) {
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
    }

    // Check all eth nodes
    await this.transactor.checkNodes()
  }
}
