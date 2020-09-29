import { BigNumber, ethers } from 'ethers'
import { ETH_A } from 'geb.js/lib/utils'
import { PingerAccount } from './chains/accounts'
import { BalanceChecker } from './checkers/balance'
import { Notifier } from './notifications/notifier'
import { CoinFsmPinger, CollateralFsmPinger } from './pingers/fsm'
import { ChainlinkMedianizerPinger, UniswapMedianizerPinger } from './pingers/medianizer'
import { TaxCollectorPinger } from './pingers/tax-collector'
import { getAddress, getWallet } from './utils/wallet'

type EnvVar =
  | 'ETH_RPC'
  | 'ACCOUNTS_PASSPHRASE'
  | 'MEDIANIZER_ETH_ADDRESS'
  | 'MEDIANIZER_RAI_ADDRESS'
  | 'MEDIANIZER_FLX_ADDRESS'
  | 'MIN_ETH_BALANCE'
  | 'FSM_ETH_ADDRESS'
  | 'FSM_RAI_ADDRESS'
  | 'FSM_FLX_ADDRESS'
  | 'ORACLE_RELAYER_ADDRESS'
  | 'TAX_COLLECTOR_ADDRESS'
  | 'REWARD_RECEIVER'
  | 'SLACK_HOOK_URL'
  | 'TWILIO_AUTH_TOKEN'
  | 'TWILIO_SEND_NUMBER'
  | 'TWILIO_SID'

const env = process.env as { [key in EnvVar]: string }

export const notifier = new Notifier(
  env.SLACK_HOOK_URL,
  env.TWILIO_AUTH_TOKEN,
  env.TWILIO_SID,
  env.TWILIO_SEND_NUMBER
)

// Chainlink ETH medianizer
export const updateChainlinkETHMedianizer = async () => {
  const wallet = getWallet(env.ETH_RPC, env.ACCOUNTS_PASSPHRASE, PingerAccount.MEDIANIZER_ETH)
  const pinger = new ChainlinkMedianizerPinger(
    env.MEDIANIZER_ETH_ADDRESS,
    wallet,
    600,
    env.REWARD_RECEIVER
  )
  await pinger.ping()
}

// Uniswap RAI medianizer
export const updateUniswapRAIMedianizer = async () => {
  const wallet = getWallet(env.ETH_RPC, env.ACCOUNTS_PASSPHRASE, PingerAccount.MEDIANIZER_RAI)
  const pinger = new UniswapMedianizerPinger(
    env.MEDIANIZER_RAI_ADDRESS,
    wallet,
    0,
    env.REWARD_RECEIVER
  )
  await pinger.ping()
}

// ETH OSM
export const updateETHFsm = async () => {
  const wallet = getWallet(env.ETH_RPC, env.ACCOUNTS_PASSPHRASE, PingerAccount.FSM_ETH)
  const pinger = new CollateralFsmPinger(
    env.FSM_ETH_ADDRESS,
    env.ORACLE_RELAYER_ADDRESS,
    ETH_A,
    wallet
  )
  await pinger.ping()
}

// RAI FSM
export const updateRAIFsm = async () => {
  const wallet = getWallet(env.ETH_RPC, env.ACCOUNTS_PASSPHRASE, PingerAccount.FSM_RAI)
  const pinger = new CoinFsmPinger(env.FSM_RAI_ADDRESS, wallet)
  await pinger.ping()
}

// Tax collector
export const updateTaxCollector = async () => {
  const wallet = getWallet(env.ETH_RPC, env.ACCOUNTS_PASSPHRASE, PingerAccount.TAX_COLLECTOR)
  const pinger = new TaxCollectorPinger(env.TAX_COLLECTOR_ADDRESS, wallet, ETH_A)
  await pinger.ping()
}

// Check that all bots have sufficient balance
export const balanceChecker = async () => {
  // List of pinger accounts to check
  const pingerList: [string, number][] = [
    ['ETH medianizer', PingerAccount.MEDIANIZER_ETH],
    ['RAI medianizer', PingerAccount.MEDIANIZER_RAI],
    ['ETH FSM', PingerAccount.FSM_ETH],
    ['RAI FSM', PingerAccount.FSM_RAI],
    ['Tax collector', PingerAccount.TAX_COLLECTOR],
  ]

  const bots: [string, string][] = pingerList.map((x) => [
    x[0],
    getAddress(env.ACCOUNTS_PASSPHRASE, x[1]),
  ])
  const provider = new ethers.providers.JsonRpcProvider(env.ETH_RPC)
  const checker = new BalanceChecker(bots, BigNumber.from(env.MIN_ETH_BALANCE), provider)
  await checker.check()
}
