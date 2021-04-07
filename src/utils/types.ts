export type PingerConifg = {
  chainlinkETHMedianizer: {
    enabled: boolean
    schedulerInterval: number
    minUpdateInterval: number
    medianizerAddress: string
    coinMedianizerAddress: string
    rewardReceiver: string
  }
  uniswapCoinMedianizer: {
    enabled: boolean
    schedulerInterval: number
    minUpdateInterval: number
    coinMedianizerAddress: string
    rateSetterAddress: string
    rewardReceiver: string
  }
  ethFsm: {
    enabled: boolean
    schedulerInterval: number
    minUpdateInterval: number
    fsmAddress: string
    oracleRelayerAddress: string
    collateralType: string
  }
  taxCollector: {
    enabled: boolean
    schedulerInterval: number
    minUpdateInterval: number
    taxCollectorAddress: string
    collateralType: string
  }
  stabilityFeeTreasury: {
    enabled: boolean
    schedulerInterval: number
    stabilityFeeTreasuryAddress: string
  }
  pauseExecutor: {
    enabled: boolean
    schedulerInterval: number
    dsPauseAddress: string
  }
  debtSettler: {
    enabled: boolean
    schedulerInterval: number
    accountingEngineAddress: string
    safeEngineAddress: string
  }
  ceilingSetter: {
    enabled: boolean
    schedulerInterval: number
    ceilingSetterAddress: string
    rewardReceiver: string
  }
  collateralAuctionThrottler: {
    enabled: boolean
    schedulerInterval: number
    minUpdateInterval: number
    collateralAuctionThrottlerAddress: string
    rewardReceiver: string
  }
  balanceChecker: {
    enabled: boolean
    schedulerInterval: number
    minBalance: number
  }
  livenessChecker: {
    enabled: boolean
    schedulerInterval: number
    dsPauseAddress: string
    gnosisSafeAddress: string
    checks: [string, string, number, string?][]
  }
}
