import { BigNumber, ethers } from 'ethers'
import { notifier } from '..'

export class LivenessChecker {
  constructor(
    // [name, address, maxdelay, solidity function name (Optional)]
    private checks: [string, string, number, string?][],
    private provider: ethers.providers.Provider
  ) {}

  async check() {
    for (let check of this.checks) {
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
          `Could not fetch last update Time for liveness check of ${check[0]}`
        )
        continue
      }
      const timSinceLastUpdate = BigNumber.from(Math.floor(Date.now() / 1000)).sub(lastUpdated)
      if (timSinceLastUpdate.gt(check[2] * 60)) {
        await notifier.sendAllChannels(
          `${check[0]} at address ${
            check[1]
          } could not be updated for more than ${timSinceLastUpdate.div(60).toString()}min`
        )
      }
    }
  }
}
