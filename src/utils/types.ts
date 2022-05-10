export type PingerConifg = {
  graphNodes: string[]
  pingers: {
    coinTwapAndRateSetter: {
      enabled: boolean
      schedulerInterval: number
      minUpdateIntervalTwap: number
      minUpdateIntervalRateSetter: number
      coinTwapAddress: string
      rateSetterAddress: string
      rewardReceiver: string
    }
    ethFsm: {
      enabled: boolean
      schedulerInterval: number
      minUpdateInterval: number
      minUpdateIntervalDeviation: number
      maxNoUpdateInterval: number
      fsmAddress: string
      oracleRelayerAddress: string
      collateralType: string
      callBundlerAddress: string
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
      minUpdateInterval: number
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
    debtFloorAdjuster: {
      enabled: boolean
      schedulerInterval: number
      minUpdateInterval: number
      debtFloorAdjusterAddress: string
      rewardReceiver: string
    }
    autoSurplusAuctionedSetter: {
      enabled: boolean
      schedulerInterval: number
      minUpdateInterval: number
      setterAddress: string
      rewardReceiver: string
    }
    autoSurplusBufferSetter: {
      enabled: boolean
      schedulerInterval: number
      minUpdateInterval: number
      setterAddress: string
      rewardReceiver: string
    }
    debtAuctionInitialParameterSetter: {
      enabled: boolean
      schedulerInterval: number
      minUpdateInterval: number
      setterAddress: string
      rewardReceiver: string
    }
    stakedTokensToKeepSetter: {
      enabled: boolean
      schedulerInterval: number
      setterAddress: string
    }
    stakeRewardRefill: {
      enabled: boolean
      schedulerInterval: number
      minUpdateInterval: number
      setterAddress: string
    }
    rewardAdjusterBundler: {
      enabled: boolean
      schedulerInterval: number
      setterAddress: string
    }
    redemptionPriceSnapOracle: {
      enabled: boolean
      schedulerInterval: number
      snapOracleAddress: string
      oracleRelayer: string
      minDeviationThreshold: number
    }
    balanceChecker: {
      enabled: boolean
      schedulerInterval: number
      mention?: string
      checks: [string, number, number][]
    }
    livenessChecker: {
      enabled: boolean
      schedulerInterval: number
      checks: [string, string, number, string?][]
    }
  }
}
