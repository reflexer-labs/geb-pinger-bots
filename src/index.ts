import { BigNumber } from 'ethers'
import { PingerAccount } from './chains/accounts'
import { BalanceChecker } from './checkers/balance'
import { LivenessChecker } from './checkers/liveness'
import { Notifier } from './notifications/notifier'
import { CeilingSetter } from './pingers/ceiling-setter'
import { CollateralAuctionThrottler } from './pingers/collateral-auction-throttler'
import { DebtSettler } from './pingers/debt-pinger'
import { CollateralFsmPinger } from './pingers/fsm'
import { ChainlinkMedianizerPinger, UniswapMedianizerPinger } from './pingers/medianizer'
import { PauseExecutor } from './pingers/pause-executor'
import { StabilityFeeTreasuryPinger } from './pingers/stability-fee-treasury'
import { TaxCollectorPinger } from './pingers/tax-collector'
import { getAddress, getProvider, getWallet } from './utils/wallet'
import { PingerConifg } from './utils/types'
import kovanConfig from './../config/config.kovan.json'
import mainnetConfig from './../config/config.mainnet.json'
import { DebtFloorAdjuster } from './pingers/debt-floor-adjuster'
import { AutoSurplusAuctionedSetter } from './pingers/auto-surplus-auctioned-setter'
import { AutoSurplusBufferSetter } from './pingers/auto-surplus-buffer-setter'
import { DebtAuctionInitialParameterSetter } from './pingers/debt-auction-initial-param-setter'
import { StakedTokensToKeepSetter } from './pingers/staked-token-to-keep-setter'
import { StakeRewardRefill } from './pingers/stake-reward-refill'
import { RewardAdjusterBundlerPinger } from './pingers/reward-adjuster-bundler'

type EnvVar =
  | 'ETH_RPC'
  | 'ACCOUNTS_PASSPHRASE'
  | 'SLACK_HOOK_MULTISIG_URL'
  | 'SLACK_HOOK_ERROR_URL'
  | 'NETWORK'

const env = process.env as { [key in EnvVar]: string }

const config = (env.NETWORK === 'mainnet' ? mainnetConfig : kovanConfig) as PingerConifg

export const notifier = new Notifier(env.SLACK_HOOK_ERROR_URL, env.SLACK_HOOK_MULTISIG_URL)

// Chainlink ETH medianizer
export const updateChainlinkRAIMedianizer = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MISCELLANEOUS,
    env.NETWORK
  )
  const pinger = new ChainlinkMedianizerPinger(
    config.pingers.chainlinkETHMedianizer.medianizerAddress,
    wallet,
    config.pingers.chainlinkETHMedianizer.minUpdateInterval * 60,
    config.pingers.chainlinkETHMedianizer.rewardReceiver
  )
  await pinger.ping()
}

// Uniswap Coin medianizer
export const updateUniswapCoinMedianizer = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MEDIANIZER_COIN,
    env.NETWORK
  )
  const pinger = new UniswapMedianizerPinger(
    config.pingers.uniswapCoinMedianizer.coinMedianizerAddress,
    config.pingers.uniswapCoinMedianizer.rateSetterAddress,
    wallet,
    config.pingers.uniswapCoinMedianizer.minUpdateIntervalMedian * 60,
    config.pingers.uniswapCoinMedianizer.minUpdateIntervalRateSetter * 60,
    config.pingers.uniswapCoinMedianizer.rewardReceiver
  )
  await pinger.ping()
}

// ETH OSM
export const updateETHFsm = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.FSM_ETH,
    env.NETWORK
  )
  const pinger = new CollateralFsmPinger(
    config.pingers.ethFsm.fsmAddress,
    config.pingers.ethFsm.oracleRelayerAddress,
    config.pingers.ethFsm.collateralType,
    wallet,
    config.pingers.ethFsm.minUpdateInterval * 60,
    config.pingers.ethFsm.maxNoUpdateInterval * 60,
    config.pingers.ethFsm.minUpdateIntervalDeviation,
    config.pingers.ethFsm.callBundlerAddress
  )
  await pinger.ping()
}

// Tax collector
export const updateTaxCollector = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.TAX_COLLECTOR,
    env.NETWORK
  )
  const pinger = new TaxCollectorPinger(
    config.pingers.taxCollector.taxCollectorAddress,
    wallet,
    config.pingers.taxCollector.collateralType,
    config.pingers.taxCollector.minUpdateInterval * 60
  )
  await pinger.ping()
}

export const updateStabilityFeeTreasury = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.STABILITY_FEE_TREASURY,
    env.NETWORK
  )
  const pinger = new StabilityFeeTreasuryPinger(
    config.pingers.stabilityFeeTreasury.stabilityFeeTreasuryAddress,
    wallet
  )
  await pinger.ping()
}

// DS pause executor
export const pauseExecutor = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.PAUSE_EXECUTOR,
    env.NETWORK
  )
  const pinger = new PauseExecutor(
    config.pingers.pauseExecutor.dsPauseAddress,
    wallet,
    config.graphNodes
  )
  await pinger.ping()
}

export const debtSettler = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.ACCOUNTING_ENGINE,
    env.NETWORK
  )
  const pinger = new DebtSettler(
    config.pingers.debtSettler.accountingEngineAddress,
    config.pingers.debtSettler.safeEngineAddress,
    wallet,
    config.graphNodes
  )
  await pinger.ping()
}

// Update the debt ceiling
export const ceilingSetter = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MISCELLANEOUS,
    env.NETWORK
  )
  const pinger = new CeilingSetter(
    config.pingers.ceilingSetter.ceilingSetterAddress,
    wallet,
    config.pingers.ceilingSetter.rewardReceiver,
    config.pingers.ceilingSetter.minUpdateInterval
  )
  await pinger.ping()
}

// Auto bump the debt ceiling by a percent
export const collateralAuctionThrottler = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MISCELLANEOUS,
    env.NETWORK
  )
  const pinger = new CollateralAuctionThrottler(
    config.pingers.collateralAuctionThrottler.collateralAuctionThrottlerAddress,
    wallet,
    config.pingers.collateralAuctionThrottler.rewardReceiver,
    config.pingers.collateralAuctionThrottler.minUpdateInterval
  )
  await pinger.ping()
}

// Set the debt floor according to some gas oracle, eth price and redemption price
export const debtFloorAdjuster = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MISCELLANEOUS,
    env.NETWORK
  )
  const pinger = new DebtFloorAdjuster(
    config.pingers.debtFloorAdjuster.debtFloorAdjusterAddress,
    wallet,
    config.pingers.debtFloorAdjuster.rewardReceiver,
    config.pingers.debtFloorAdjuster.minUpdateInterval
  )
  await pinger.ping()
}

export const autoSurplusAuctionedSetter = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MISCELLANEOUS,
    env.NETWORK
  )
  const pinger = new AutoSurplusAuctionedSetter(
    config.pingers.autoSurplusAuctionedSetter.setterAddress,
    wallet,
    config.pingers.autoSurplusAuctionedSetter.rewardReceiver,
    config.pingers.autoSurplusAuctionedSetter.minUpdateInterval
  )
  await pinger.ping()
}

export const autoSurplusBufferSetter = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MISCELLANEOUS,
    env.NETWORK
  )
  const pinger = new AutoSurplusBufferSetter(
    config.pingers.autoSurplusBufferSetter.setterAddress,
    wallet,
    config.pingers.autoSurplusBufferSetter.rewardReceiver,
    config.pingers.autoSurplusBufferSetter.minUpdateInterval
  )
  await pinger.ping()
}

export const debtAuctionInitialParameterSetter = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MISCELLANEOUS,
    env.NETWORK
  )
  const pinger = new DebtAuctionInitialParameterSetter(
    config.pingers.debtAuctionInitialParameterSetter.setterAddress,
    wallet,
    config.pingers.debtAuctionInitialParameterSetter.rewardReceiver,
    config.pingers.debtAuctionInitialParameterSetter.minUpdateInterval
  )
  await pinger.ping()
}

export const stakedTokensToKeepSetter = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MISCELLANEOUS,
    env.NETWORK
  )
  const pinger = new StakedTokensToKeepSetter(
    config.pingers.stakedTokensToKeepSetter.setterAddress,
    wallet
  )
  await pinger.ping()
}

export const stakeRewardRefill = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MISCELLANEOUS,
    env.NETWORK
  )
  const pinger = new StakeRewardRefill(
    config.pingers.stakeRewardRefill.setterAddress,
    wallet,
    config.pingers.stakeRewardRefill.minUpdateInterval
  )
  await pinger.ping()
}

export const rewardAdjusterBundler = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MISCELLANEOUS,
    env.NETWORK
  )
  const pinger = new RewardAdjusterBundlerPinger(
    config.pingers.rewardAdjusterBundler.setterAddress,
    wallet
  )
  await pinger.ping()
}

// Check that all bots have sufficient balance
export const balanceChecker = async () => {
  const bots: [string, string, number][] = config.pingers.balanceChecker.checks.map((x) => [
    x[0],
    getAddress(env.ACCOUNTS_PASSPHRASE, x[1]),
    x[2],
  ])
  const provider = await getProvider(env.ETH_RPC, env.NETWORK)
  const checker = new BalanceChecker(bots, provider, config.pingers.balanceChecker.mention)
  await checker.check()
}

export const livenessChecker = async () => {
  const time = Date.now()
  // List of contracts for which we check lastUpdateTime values and their max delay tolerance (in minutes)
  const checks = config.pingers.livenessChecker.checks

  const provider = await getProvider(env.ETH_RPC, env.NETWORK)
  const checker = new LivenessChecker(checks, provider, config.graphNodes)
  await checker.check()
  console.log(`Execution time: ${(Date.now() - time) / 1000}s`)
}
