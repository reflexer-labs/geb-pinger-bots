import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'
import { Store } from '../utils/store'

type StatusInfo = {
  // Network name
  [key: string]: {
    status: {
      // Contract name
      [key: string]: boolean
    }
    // Contract name
    lastUpdated: {
      [key: string]: number
    }
  }
}

export class LivenessChecker {
  constructor(
    // [name, address, maxdelay, solidity function name (Optional)]
    private checks: [string, string, number, string?][],
    private provider: ethers.providers.Provider,
    private store: Store
  ) {}

  async check() {
    const networkName = (await this.provider.getNetwork()).name
    let newStatus: StatusInfo = {
      [networkName]: {
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

    await this.store.mergedPutJson('status.json', newStatus)
  }
}
