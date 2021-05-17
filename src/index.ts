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
export const updateChainlinkETHMedianizer = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MEDIANIZER_ETH,
    env.NETWORK
  )
  const pinger = new ChainlinkMedianizerPinger(
    config.pingers.chainlinkETHMedianizer.medianizerAddress,
    config.pingers.chainlinkETHMedianizer.coinMedianizerAddress,
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
    config.pingers.uniswapCoinMedianizer.minUpdateInterval * 60,
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
    config.pingers.ceilingSetter.rewardReceiver
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
