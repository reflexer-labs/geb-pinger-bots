# Geb Pinger Bots

## Overview

This repo is a collection of AWS Lambda functions built with the serverless framework which are meant to perform tasks on a GEB deployment. These functions mainly do 2 things:

- Call non authed smart contract functions that need to be updated periodically or upon a specific event
- Monitor the health of smart-contracts and system services and send errors if anomalies are detected

This repo includes the following bots:

- `coinTwapAndRateSetter` Call the update function of the system coin medianizer pulling the price from a Uniswap TWAP
- `ETHFsm` Update the ETH FSM (OSM) and subsequently call the OracleRelayer contract to push the new price inside the core system
- `taxCollector` Call the Tax Collector to collect stability fees from open safes
- `stabilityFeeTreasury` Transfer any potential stability fee surplus from the treasury
- `pauseExecutor` Execute pending proposals from DSPause like contracts
- `debtSettler` Call the settle debt function in the AccountingEngine contract
- `ceilingSetter` Set the debt ceiling according to the current amount of RAI outstanding
- `collateralAuctionThrottler` Set the maximum amount of collateral that can be auctioned at once according to the amount of lock collateral
- `debtFloorAdjuster` Set the debt floor according to a gas oracle
- `autoSurplusAuctionedSetter` Set surplus auction parameters
- `autoSurplusBufferSetter` Set the surplus buffer size according to the locked collateral
- `debtAuctionInitialParameterSetter` Set debt auction parameters
- `stakedTokensToKeepSetter` Set the percentage of maximum staked protocol token LP that can be auctioned
- `stakeRewardRefill` Call the function will refill the protocol token staking reward from the stakingRewardRefiller contract
- `rewardAdjusterBundler` Call the bundler contract that update all the pinger reward amount parameters
- `redemptionPriceSnapOracle` Update the snapshot oracle of the redemption price. The oracle is used by the Curve pool and others
- `balanceChecker` Check that the ETH balance of a pinger is sufficient to pay for gas costs
- `livenessChecker` Check that the the FSMs, medianizers and the TaxCollector were recently updated. Check that the Ethereum nodes used by the pinger are responsive and up to date. Check the the subgraph nodes are responsive and up to date. Send notifications upon detecting new multisig transactions. Update the status file at https://status.reflexer.finance/ or https://status-kovan.reflexer.finance/

Important: Rewards accrued by the `ETHFsm` pinger are accrued in a separated contract. To claim the rewards of this pinger, call the `withdrawPayout` function on its `callBundlerAddress` contract (See the `ETHFsm` config)

## Setup

Clone the repo & install dependencies

```
git clone git@github.com:reflexer-labs/geb-pinger-bots.git
npm i
```

The pinger bots are deployed on AWS Lambda using the serverless framework. You will need an account on https://app.serverless.com/. This account will have to be added to the `reflexer` organization. You can change the organization/serverless account in the `serveless.yml` file.

If you are new to serverless, follow their AWS getting started guide: https://www.serverless.com/framework/docs/getting-started and how to setup the AWS credentials: https://www.serverless.com/framework/docs/providers/aws/guide/credentials

## Local testing & development

Run the pinger bots locally for testing and development on Kovan or Mainnet Ethereum:

```
npm run local-kovan <PINGER BOT NAME>
npm run local-mainnet <PINGER BOT NAME>
```

**Important**: The command above will securely fetch the remote configuration from the serverless servers in order to run the function locally. It will also make you spend real ETH or KETH.

## Production deployment

The following commands will deploy all the lambda functions from `serverless.yml` on AWS:

```
npm run deploy-kovan
npm run deploy-mainnet
```

To remove the deployment and cleanup all AWS resources, do:

```
serverless remove --stage kovan
serverless remove --stage mainnet
```
## RAI subsidy

Some pinger functions are subsidized by the RAI protocol treasury. The subsidy is meant to reimburse gas costs plus a small profit to incentivize people to run pingers. The subsidized pingers are the one with a `rewardAddress` parameter in `config/config.mainnet.json`. Make sure to replace the address with your own. 

Rewards are accrued as RAI internal balance, it will not be visible as an ERC20 balance directly. To see you current internal balance, go the RAI SafeEngine contract: https://etherscan.io/address/0xcc88a9d330da1133df3a7bd823b95e52511a6962#readContract and call the `coinBalance` function with you reward address in parameter. The amount displayed is a number of RAI with the decimal at the 45th place. 

To withdraw the RAI as ERC20, you need to do these following 2 steps using your reward address set in the config file.

1. Approve the RAI coinJoin to pull funds. Call the `approveSAFEModification` on the SafeEngine with the address of the RAI CoinJoin contract `0x0A5653CCa4DB1B6E265F47CAf6969e64f1CFdC45` in parameter.
2. Go to the RAI CoinJoin contract `https://etherscan.io/address/0x0A5653CCa4DB1B6E265F47CAf6969e64f1CFdC45#writeContract` and call the exit function with the destination address and amount to exit as a WAD number (18th decimal place).

## Configuration

Bot environment variables can be configured from the serverless dashboard:

- Mainnet: https://app.serverless.com/<ORG_NAME>/apps/geb-pinger-bots/geb-pinger-bots/settings/stages/mainnet
- Kovan: https://app.serverless.com/<ORG_NAME>/apps/geb-pinger-bots/geb-pinger-bots/settings/stages/kovan

After changing a variable, the bots also need to be redeployed. To do that, open the serverless dashboard and go to App -> Kovan/Mainnet -> Deploys and click on "Redeploy".

All environment variables are exclusively read from the `src/index.ts` file.

Currently, the following variables are available:

- `ETH_RPC` comma separated list of Ethereum RPC nodes
- `ACCOUNTS_PASSPHRASE` secret passphrase used to derive Ethereum addresses for pingers. Each bot uses its own address. The derivation method used is the standard one. Each bot has a derivation path such as `m/44'/60'/0'/0/0`, `m/44'/60'/0'/0/1`, etc. _Tip_: use a tool like https://iancoleman.io/bip39/ to manage pinger keys
- `SLACK_HOOK_ERROR_URL` Slack hook to send error notifications to
- `SLACK_HOOK_MULTISIG_URL` Slack hook to send multisig notifications to
- `BLOCKNATIVE_API_KEY` Optional, blocknative API is being used for gas prices. Use the ETH node gas estimate if unspecified.

AWS VPC configuration. The parameters in this section are needed if you wish to give a dedicated IP to the lambda functions. It is useful if your ETH node is behind a firewall. If you do not need a dedicated IP, skip these parameters and comment-out the VPC section in the `serverless.yml` file. If you do, make sure to read the AWS documentation and configure the variables below.
https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/generate-a-static-outbound-ip-address-using-a-lambda-function-amazon-vpc-and-a-serverless-architecture.html

- `AWS_VPC_SUBNET_ID_1` First VPC id manually created on the AWS console
- `AWS_VPC_SUBNET_ID_2` First VPC id manually created on the AWS console
- `AWS_SECURITY_GROUP` Dedicated security group

Important configuration including contract addresses, execution interval and more is located in `config/config.mainnet.json` or `config/config.kovan.json`. These file currently contain the configuration the main RAI deployment. Below is a commented version of the json configuration file:

```jsonc
{
  // The liveness checker will the health of graph nodes to throw alerts. The main public subgraph node can be used. Ignored if the liveness checker isn't running 
  "graphNodes": ["https://subgraph.reflexer.finance/subgraphs/name/reflexer-labs/rai"],
  "pingers": {
    "coinTwapAndRateSetter": {
      // Set to false to not deploy this pinger
      "enabled": true,
      // Time interval between each run of the of the lambda function in minutes
      "schedulerInterval": 30,
      // Will not send an update to the RAI TWAP if the last update is younger than this, in minutes
      "minUpdateIntervalTwap": 720,
      // Will not send an update to the Rate setter if the last update is younger than this, in minutes
      "minUpdateIntervalRateSetter": 720,
      "coinTwapAddress": "0x92dC9b16be52De059279916c1eF810877f85F960",
      "rateSetterAddress": "0x7Acfc14dBF2decD1c9213Db32AE7784626daEb48",
      // Address receiving rewards, set your own
      "rewardReceiver": "0xBd3f90047B14e4f392d6877276d52D0aC59F4CF8"
    },
    "ethFsm": {
      "enabled": true,
      "schedulerInterval": 10,
      // Will not send an update to the FSM if the last update is younger than this, in minutes
      "minUpdateInterval": 60,
      // Will send an update if the last update was older than that
      "maxNoUpdateInterval": 480,
      // Deviation threshold in percent, will send an update if the ETH price deviated more than that
      "minUpdateIntervalDeviation": 0.05,
      "fsmAddress": "0xD4A0E3EC2A937E7CCa4A192756a8439A8BF4bA91",
      "oracleRelayerAddress": "0x4ed9C0dCa0479bC64d8f4EB3007126D5791f7851",
      "collateralType": "0x4554482d41000000000000000000000000000000000000000000000000000000",
      "callBundlerAddress": "0x2D68a2445446e22b73fC90c05bB57C9148aaB1Ac"
    },
    
    // ...
    
    // We omitted some pingers whose configuration is similar to the ones above
    
    // ...

    "redemptionPriceSnapOracle": {
      "enabled": true,
      "schedulerInterval": 180,
      "snapOracleAddress": "0x07210B8871073228626AB79c296d9b22238f63cE",
      "oracleRelayer": "0x4ed9C0dCa0479bC64d8f4EB3007126D5791f7851",
      // Deviation threshold in percent, will send an update if the RAI price deviated more than that
      "minDeviationThreshold": 0.0005
    },
    // This pinger is optional, it will throw alert when some of the pinger addresses are low balance
    "balanceChecker": {
      "enabled": true,
      // Interval at which to check balance in minutes
      "schedulerInterval": 90,
      // Optional, a Slack user ID to tag in the alert message
      "mention": "U018QF2QUVA",
      "checks": [
        // [ Label of the pinger, Account id from the derivation path of the seedphrase, balance threshold amount ]
        ["Coin twap", 1, 0.5],
        ["ETH FSM", 2, 0.5],
        ["Tax collector", 4, 0.5],
        ["Pause executor", 5, 0.5],
        ["Stability fee treasury", 8, 0.5],
        ["Debt settler", 9, 0.5],
        ["Miscellaneous", 11, 0.5]
      ]
    },
    
    // Optional pinger. It does a large number of check on the underlying infrastructure 
    // - ETH node check, that their block number isn't stall
    // - Graph node check, that the sync block isn't stuck
    // - Check that each pinger last updated status is below a threshold
    "livenessChecker": {
      "enabled": true,
      // How often the whole check is done
      "schedulerInterval": 30,
      "checks": [
        // Individual pinger check configuration
        // [0] Pinger label
        // [1] Target contract
        // [2] Max last update tolerated in minutes
        // [3] Optional function name to call on the contract. If not provided, will default to "lastUpdatedTimestamp"  
        [
          "chainlink_eth_oracle",
          "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
          60,
          "latestTimestamp"
        ],
        ["coin_twap", "0x92dC9b16be52De059279916c1eF810877f85F960", 1500],
        ["eth_fsm", "0xD4A0E3EC2A937E7CCa4A192756a8439A8BF4bA91", 500],
        [
          "oracle_relayer",
          "0x4ed9C0dCa0479bC64d8f4EB3007126D5791f7851",
          500,
          "redemptionPriceUpdateTime"
        ],
        ["rate_setter", "0x7Acfc14dBF2decD1c9213Db32AE7784626daEb48", 1500],
        [
          "stability_fee_treasury_transfer_surplus",
          "0x83533fdd3285f48204215E9CF38C785371258E76",
          347040e5,
          "latestSurplusTransferTime"
        ],
        [
          "tax_collector",
          "0xcDB05aEda142a1B0D6044C09C64e4226c1a281EB",
          1460,
          "0x4554482d41000000000000000000000000000000000000000000000000000000"
        ],
        ["collateral_auction_throttler", "0x59536C9Ad1a390fA0F60813b2a4e8B957903Efc7", 10140],
        ["ceiling_setter", "0x54999Ee378b339f405a4a8a1c2f7722CD25960fa", 345600],
        ["debt_floor_adjuster", "0x0262Bd031B99c5fb99B47Dc4bEa691052f671447", 66240],
        ["auto_surplus_auctioned_setter", "0xa43BFA2a04c355128F3f10788232feeB2f42FE98", 31680],
        [
          "debt_auction_initial_parameter_setter",
          "0x7df2d51e69aA58B69C3dF18D75b8e9ACc3C1B04E",
          31680
        ],
        [
          "stake_reward_refiller",
          "0xc5fEcD1080d546F9494884E834b03D7AD208cc02",
          518400,
          "lastRefillTime"
        ]
      ]
    }
  }
```