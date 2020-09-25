import { BigNumber, ethers } from 'ethers'
import { ETH_A } from 'geb.js/lib/utils'
import { PingerAccount } from './chains/accounts'
import { BalanceChecker } from './checkers/balance'
import { Notifier } from './notifications/notifier'
import { CollateralFsmPinger } from './pingers/fsm'
import { MedianizerPinger, UniswapMedianizerPinger } from './pingers/medianizer'
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

const env = process.env as { [key in EnvVar]: string }

export const notifier = new Notifier()

export const updateChainlinkETHMedianizer = async () => {
    const wallet = getWallet(env.ETH_RPC, env.ACCOUNTS_PASSPHRASE, PingerAccount.MEDIANIZER_ETH)
    const pinger = new MedianizerPinger(env.MEDIANIZER_ETH_ADDRESS, wallet, 600)
    await pinger.ping()
}

export const updateUniswapRAIMedianizer = async () => {
    const wallet = getWallet(env.ETH_RPC, env.ACCOUNTS_PASSPHRASE, PingerAccount.MEDIANIZER_RAI)
    const pinger = new UniswapMedianizerPinger(env.MEDIANIZER_RAI_ADDRESS, wallet, 0)
    await pinger.ping()
}

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

export const balanceChecker = async () => {
    // List of pinger accounts to check
    const pingerList = [
        PingerAccount.MEDIANIZER_ETH,
        PingerAccount.MEDIANIZER_RAI,
        PingerAccount.FSM_ETH,
    ]

    const addresses = pingerList.map((x) => getAddress(env.ACCOUNTS_PASSPHRASE, x))
    const provider = new ethers.providers.JsonRpcProvider(env.ETH_RPC)
    const checker = new BalanceChecker(addresses, BigNumber.from(env.MIN_ETH_BALANCE), provider)

    await checker.check()
}
