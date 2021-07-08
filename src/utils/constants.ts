import { BigNumber } from 'ethers'

export const ZERO_BN = BigNumber.from(0)

export const SECONDS_PER_DAY = 3600 * 24

// In seconds
export const APPROXIMATED_BLOCK_INTERVAL = 13
// If a RPC did not reply within this timeout, start querying other nodes
export const RPC_STALL_TIMEOUT = 3000
// Timeout after which the RPC query is considered failed
export const RPC_FAILED_TIMEOUT = 10000
// If the timestamp of the latest block is older than this amount of seconds, throw alert
export const ETH_NODE_STALL_SYNC_TIMEOUT = 300 // 5 min
// If a graph node is behind the chain by this number of block, trigger the alert
export const MAX_GRAPH_NODE_BLOCK_DELAY = 7
// Amount of gas to add on the top of a gas estimate
export const GAS_ESTIMATE_BUFFER = 100000
// Percentage of gas gas price bump when a tx gets stuck in the mempool
export const PENDING_TRANSACTION_GAS_BUMP_PERCENT = 30

// Gas constants for each contract call
// Naming pattern: <Contract name>__<function name>_GAS
export const TAX_COLLECTOR__TAX_SINGLE_GAS = BigNumber.from('200000')
export const STABILITY_FEE_TREASURY__TRANSFER_SURPLUS_FUNDS_GAS = BigNumber.from('400000')
export const RATE_SETTER__UPDATE_RATE_GAS = BigNumber.from('500000')
export const COIN_MEDIANIZER__UPDATE_RESULTS_GAS = BigNumber.from('550000')
export const CHAINLINK_MEDIANIZER__UPDATE_RESULTS_GAS = BigNumber.from('400000')
export const COLLATERAL_FSM__UPDATE_RESULTS_GAS = BigNumber.from('300000')
export const ORACLE_RELAYER__UPDATE_COLLATERAL_PRICE_GAS = BigNumber.from('200000')
export const ACCOUNTING_ENGINE__POP_DEBT_FROM_QUEUE_GAS = BigNumber.from('200000')
export const SAFE_ENGINE__SETTLE_DEBT_GAS = BigNumber.from('200000')
export const COLLATERAL_AUCTION_THROTTLER__RECOMPUTE_ON_AUCTION_SYSTEM_COIN_LIMIT_GAS =
  BigNumber.from('500000')
export const GEB_DEBT_FLOOR_ADJUSTER__RECOMPUTE_COLLATERAL_DEBT_FLOOR = BigNumber.from('300000')
export const CEILING_SETTER_AUTO_UPDATE_CEILING = BigNumber.from('500000')
