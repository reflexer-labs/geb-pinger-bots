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
import { Store } from './utils/store'
import { getAddress, getProvider, getWallet } from './utils/wallet'
import { PingerConifg } from './utils/types'
import kovanConfig from './../config/config.kovan.json'
import mainnetConfig from './../config/config.mainnet.json'

type EnvVar =
  | 'ETH_RPC'
  | 'ACCOUNTS_PASSPHRASE'
  | 'SLACK_HOOK_MULTISIG_URL'
  | 'SLACK_HOOK_ERROR_URL'
  | 'TWILIO_AUTH_TOKEN'
  | 'TWILIO_SEND_NUMBER'
  | 'TWILIO_SID'
  | 'PHONE_NOTIFICATION_RECEIVER'
  | 'GEB_SUBGRAPH_URL'
  | 'STATUS_BUCKET'
  | 'AWS_ID'
  | 'AWS_SECRET'
  | 'NETWORK'

const env = process.env as { [key in EnvVar]: string }

const config = (env.NETWORK === 'mainnet' ? mainnetConfig : kovanConfig) as PingerConifg

export const notifier = new Notifier(
  env.SLACK_HOOK_ERROR_URL,
  env.SLACK_HOOK_MULTISIG_URL,
  env.TWILIO_AUTH_TOKEN,
  env.TWILIO_SID,
  env.TWILIO_SEND_NUMBER,
  JSON.parse(env.PHONE_NOTIFICATION_RECEIVER)
)

// Chainlink ETH medianizer
export const updateChainlinkETHMedianizer = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MEDIANIZER_ETH,
    env.NETWORK
  )
  const pinger = new ChainlinkMedianizerPinger(
    config.chainlinkETHMedianizer.medianizerAddress,
    config.chainlinkETHMedianizer.coinMedianizerAddress,
    wallet,
    config.chainlinkETHMedianizer.minUpdateInterval * 60,
    config.chainlinkETHMedianizer.rewardReceiver
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
    config.uniswapCoinMedianizer.coinMedianizerAddress,
    config.uniswapCoinMedianizer.rateSetterAddress,
    wallet,
    config.uniswapCoinMedianizer.minUpdateInterval * 60,
    config.uniswapCoinMedianizer.rewardReceiver
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
    config.ethFsm.fsmAddress,
    config.ethFsm.oracleRelayerAddress,
    config.ethFsm.collateralType,
    wallet,
    config.ethFsm.minUpdateInterval * 60
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
    config.taxCollector.taxCollectorAddress,
    wallet,
    config.taxCollector.collateralType,
    config.taxCollector.minUpdateInterval * 60
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
    config.stabilityFeeTreasury.stabilityFeeTreasuryAddress,
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
    config.pauseExecutor.dsPauseAddress,
    wallet,
    env.GEB_SUBGRAPH_URL
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
    config.debtSettler.accountingEngineAddress,
    config.debtSettler.safeEngineAddress,
    wallet,
    env.GEB_SUBGRAPH_URL
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
    config.ceilingSetter.ceilingSetterAddress,
    wallet,
    config.ceilingSetter.rewardReceiver
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
    config.collateralAuctionThrottler.collateralAuctionThrottlerAddress,
    wallet,
    config.collateralAuctionThrottler.rewardReceiver,
    config.collateralAuctionThrottler.minUpdateInterval
  )
  await pinger.ping()
}

// Check that all bots have sufficient balance
export const balanceChecker = async () => {
  // List of pinger accounts to check
  const pingerList: [string, number, string?][] = [
    ['ETH medianizer', PingerAccount.MEDIANIZER_ETH],
    ['Coin medianizer', PingerAccount.MEDIANIZER_COIN],
    ['ETH FSM', PingerAccount.FSM_ETH],
    ['Tax collector', PingerAccount.TAX_COLLECTOR],
    ['Pause executor', PingerAccount.PAUSE_EXECUTOR],
    ['Stability fee treasury', PingerAccount.STABILITY_FEE_TREASURY],
    ['Debt settler', PingerAccount.ACCOUNTING_ENGINE],
    ['Miscellaneous', PingerAccount.MISCELLANEOUS],
  ]

  const bots: [string, string][] = pingerList.map((x) => [
    x[0],
    getAddress(env.ACCOUNTS_PASSPHRASE, x[1]),
  ])
  const provider = await getProvider(env.ETH_RPC, env.NETWORK)
  const checker = new BalanceChecker(
    bots,
    BigNumber.from(config.balanceChecker.minBalance),
    provider
  )
  await checker.check()
}

export const livenessChecker = async () => {
  const time = Date.now()
  // List of contracts for which we check lastUpdateTime values and their max delay tolerance (in minutes)
  const checks = config.livenessChecker.checks

  const provider = await getProvider(env.ETH_RPC, env.NETWORK)
  const store = new Store(env.STATUS_BUCKET, env.AWS_ID, env.AWS_SECRET)
  const checker = new LivenessChecker(
    checks,
    provider,
    store,
    env.GEB_SUBGRAPH_URL,
    config.livenessChecker.dsPauseAddress,
    config.livenessChecker.gnosisSafeAddress
  )
  await checker.check()
  console.log(`Execution time: ${(Date.now() - time) / 1000}s`)
}
