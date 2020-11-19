import { BigNumber } from 'ethers'

export const now = () => BigNumber.from(Math.floor(Date.now() / 1000))
