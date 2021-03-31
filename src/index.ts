import { BigNumber } from 'ethers'
import { ETH_A } from 'geb.js/lib/utils'
import { PingerAccount } from './chains/accounts'
import { BalanceChecker } from './checkers/balance'
import { LivenessChecker } from './checkers/liveness'
import { Notifier } from './notifications/notifier'
import { CeilingSetter } from './pingers/ceiling-setter'
import { CollateralAuctionThrottler } from './pingers/collateral-auction-throttler'
import { DebtSettler } from './pingers/debt-pinger'
import { CollateralFsmPinger } from './pingers/fsm'
import {
  ChainlinkMedianizerPinger,
  UniswapMedianizerPinger,
  UniswapSpotMedianizerPinger,
} from './pingers/medianizer'
import { PauseExecutor } from './pingers/pause-executor'
import { StabilityFeeTreasuryPinger } from './pingers/stability-fee-treasury'
import { TaxCollectorPinger } from './pingers/tax-collector'
import { Store } from './utils/store'
import { getAddress, getProvider, getWallet } from './utils/wallet'

type EnvVar =
  | 'ETH_RPC'
  | 'ACCOUNTS_PASSPHRASE'
  | 'MEDIANIZER_ETH_ADDRESS'
  | 'MEDIANIZER_RAI_ADDRESS'
  | 'MIN_ETH_BALANCE'
  | 'FSM_ETH_ADDRESS'
  | 'ORACLE_RELAYER_ADDRESS'
  | 'TAX_COLLECTOR_ADDRESS'
  | 'ETH_A_COLLATERAL_AUCTION_HOUSE_ADDRESS'
  | 'MEDIANIZER_RAI_SPOT_ADDRESS'
  | 'ACCOUNTING_ENGINE_ADDRESS'
  | 'SAFE_ENGINE_ADDRESS'
  | 'UNI_ETH_RAI_PAIR_ADDRESS'
  | 'CEILING_SETTER_ADDRESS'
  | 'COLLATERAL_AUCTION_THROTTLER_ADDRESS'
  | 'REWARD_RECEIVER'
  | 'SLACK_HOOK_MULTISIG_URL'
  | 'SLACK_HOOK_ERROR_URL'
  | 'TWILIO_AUTH_TOKEN'
  | 'TWILIO_SEND_NUMBER'
  | 'TWILIO_SID'
  | 'SCHEDULER_INTERVAL_ETH_MEDIAN'
  | 'SCHEDULER_INTERVAL_RAI_MEDIAN'
  | 'SCHEDULER_INTERVAL_ETH_FSM'
  | 'SCHEDULER_INTERVAL_RATE_SETTER'
  | 'PHONE_NOTIFICATION_RECEIVER'
  | 'GEB_SUBGRAPH_URL'
  | 'DS_PAUSE_ADDRESS'
  | 'RATE_SETTER_ADDRESS'
  | 'STABILITY_FEE_TREASURY_ADDRESS'
  | 'STATUS_BUCKET'
  | 'AWS_ID'
  | 'AWS_SECRET'
  | 'GNOSIS_SAFE'
  | 'NETWORK'
  | 'MIN_UPDATE_INTERVAL_ETH_MEDIAN'
  | 'MIN_UPDATE_INTERVAL_RAI_MEDIAN'
  | 'MIN_UPDATE_INTERVAL_ETH_FSM'
  | 'MIN_UPDATE_INTERVAL_TAX_COLLECTOR'
  | 'MIN_UPDATE_INTERVAL_RAI_SPOT_MEDIAN'
  | 'MIN_UPDATE_INTERVAL_COLLATERAL_AUCTION_THROTTLER'

const env = process.env as { [key in EnvVar]: string }

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
    env.MEDIANIZER_ETH_ADDRESS,
    env.MEDIANIZER_RAI_ADDRESS,
    wallet,
    parseInt(env.MIN_UPDATE_INTERVAL_ETH_MEDIAN) * 60,
    env.REWARD_RECEIVER
  )
  await pinger.ping()
}

// Uniswap RAI medianizer
export const updateUniswapRAIMedianizer = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MEDIANIZER_RAI,
    env.NETWORK
  )
  const pinger = new UniswapMedianizerPinger(
    env.MEDIANIZER_RAI_ADDRESS,
    env.RATE_SETTER_ADDRESS,
    wallet,
    parseInt(env.MIN_UPDATE_INTERVAL_RAI_MEDIAN) * 60,
    env.REWARD_RECEIVER
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
    env.FSM_ETH_ADDRESS,
    env.ORACLE_RELAYER_ADDRESS,
    ETH_A,
    wallet,
    parseInt(env.MIN_UPDATE_INTERVAL_ETH_FSM) * 60
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
    env.TAX_COLLECTOR_ADDRESS,
    wallet,
    ETH_A,
    parseInt(env.MIN_UPDATE_INTERVAL_TAX_COLLECTOR) * 60
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
  const pinger = new StabilityFeeTreasuryPinger(env.STABILITY_FEE_TREASURY_ADDRESS, wallet)
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
  const pinger = new PauseExecutor(env.DS_PAUSE_ADDRESS, wallet, env.GEB_SUBGRAPH_URL)
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
    env.ACCOUNTING_ENGINE_ADDRESS,
    env.SAFE_ENGINE_ADDRESS,
    wallet,
    env.GEB_SUBGRAPH_URL
  )
  await pinger.ping()
}

// Similar to updateUniswapRAIMedianizer but points to a different medianizer
// contract with a shorter TWAP window. This send an update only in when price
// deviation between Market price and redemption price.
export const uniswapSpotMedianizerPinger = async () => {
  const wallet = await getWallet(
    env.ETH_RPC,
    env.ACCOUNTS_PASSPHRASE,
    PingerAccount.MEDIANIZER_RAI_SPOT,
    env.NETWORK
  )
  const pinger = new UniswapSpotMedianizerPinger(
    env.MEDIANIZER_RAI_SPOT_ADDRESS,
    env.MEDIANIZER_ETH_ADDRESS,
    env.UNI_ETH_RAI_PAIR_ADDRESS,
    env.ORACLE_RELAYER_ADDRESS,
    env.ETH_A_COLLATERAL_AUCTION_HOUSE_ADDRESS,
    wallet,
    parseInt(env.MIN_UPDATE_INTERVAL_RAI_SPOT_MEDIAN) * 60,
    env.REWARD_RECEIVER
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
  const pinger = new CeilingSetter(env.CEILING_SETTER_ADDRESS, wallet, env.REWARD_RECEIVER)
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
    env.COLLATERAL_AUCTION_THROTTLER_ADDRESS,
    wallet,
    env.REWARD_RECEIVER,
    env.MIN_UPDATE_INTERVAL_COLLATERAL_AUCTION_THROTTLER
  )
  await pinger.ping()
}

// Check that all bots have sufficient balance
export const balanceChecker = async () => {
  // List of pinger accounts to check
  const pingerList: [string, number, string?][] = [
    ['ETH medianizer', PingerAccount.MEDIANIZER_ETH],
    ['RAI medianizer', PingerAccount.MEDIANIZER_RAI],
    ['ETH FSM', PingerAccount.FSM_ETH],
    ['Tax collector', PingerAccount.TAX_COLLECTOR],
    ['Pause executor', PingerAccount.PAUSE_EXECUTOR],
    ['Stability fee treasury', PingerAccount.STABILITY_FEE_TREASURY],
    ['Debt settler', PingerAccount.ACCOUNTING_ENGINE],
    // ['RAI spot medianizer', PingerAccount.MEDIANIZER_RAI_SPOT],
    ['Miscellaneous', PingerAccount.MISCELLANEOUS],
  ]

  const bots: [string, string][] = pingerList.map((x) => [
    x[0],
    getAddress(env.ACCOUNTS_PASSPHRASE, x[1]),
  ])
  const provider = await getProvider(env.ETH_RPC, env.NETWORK)
  const checker = new BalanceChecker(bots, BigNumber.from(env.MIN_ETH_BALANCE), provider)
  await checker.check()
}

export const livenessChecker = async () => {
  const time = Date.now()
  // List of contracts for which we check lastUpdateTime values and their max delay tolerance (in minutes)
  const checks: [string, string, number, string?][] = [
    ['eth_medianizer', env.MEDIANIZER_ETH_ADDRESS, 320], // Different from mainnet because Chainlink is update their oracle less often
    ['prai_medianizer', env.MEDIANIZER_RAI_ADDRESS, 320], // Different from mainnet because the median on Kovan works with longer interval
    ['eth_fsm', env.FSM_ETH_ADDRESS, 80],
    ['oracle_relayer', env.ORACLE_RELAYER_ADDRESS, 80, 'redemptionPriceUpdateTime'],
    ['rate_setter', env.RATE_SETTER_ADDRESS, 320], //   Different from mainnet because the median on Kovan works with longer interval
    [
      'stability_fee_treasury_transfer_surplus',
      env.STABILITY_FEE_TREASURY_ADDRESS,
      347040, // 241 Days
      'latestSurplusTransferTime',
    ],
    ['tax_collector', env.TAX_COLLECTOR_ADDRESS, 200, ETH_A],
    ['collateral_auction_throttler', env.COLLATERAL_AUCTION_THROTTLER_ADDRESS, 420], // 7h
  ]

  const provider = await getProvider(env.ETH_RPC, env.NETWORK)
  const store = new Store(env.STATUS_BUCKET, env.AWS_ID, env.AWS_SECRET)
  const checker = new LivenessChecker(
    checks,
    provider,
    store,
    env.GEB_SUBGRAPH_URL,
    env.DS_PAUSE_ADDRESS,
    env.GNOSIS_SAFE
  )
  await checker.check()
  console.log(`Execution time: ${(Date.now() - time) / 1000}s`)
}
