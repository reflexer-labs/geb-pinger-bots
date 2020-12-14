# Geb Pinger Bots

## Overview

This repo is a collection of AWS Lambda functions built with the serverless framework which are meant to perform tasks on a GEB deployment. It mainly does 2 things:

- Call non authed smart contract functions that need to be updated periodically or upon a specific event
- Monitor the health of smart-contracts and system services and send errors if anomalies are detected

This repo includes the following bots:

- `updateUniswapRAIMedianizer`: call the RAI medianizer, pull the latest RAI price from Uniswap v2 and update the oracle price
- `updateETHFsm`: update the ETH FSM (OSM) and subsequently call the oracle relayer to push the new ETH price inside the core system
- `updateRAIFsm`: update the RAI FSM (DSM) and subsequently call the PID to set a new redemption rate
- `updateTaxCollector`: collect stability fees from open Safes
- `updateStabilityFeeTreasury`: transfer any unused stability fees outside the treasury and to the AccountingEngine
- `pauseExecutor`: execute pending proposals
- `debtSettler`: call the settle debt function from AccountingEngine
- `balanceChecker`: check that the ETH balance of a pinger is high enough as to continue paying for its tasks
- `livenessChecker`: check if the RAI & collateral FSMs and medianizers as well as the tax collector have been updated recently. Check that the Ethereum nodes used by the pinger are responsive and up to date. Check the the subgraph nodes are responding and up to date. Sends notifications for new multisig transactions. Updates the status files at https://status.reflexer.finance/ or https://status-kovan.reflexer.finance/

## Setup

Clone & install dependencies

```
git clone git@github.com:reflexer-labs/geb-pinger-bots.git
npm i
```

The pinger bots are deployed on AWS Lambda using the serverless framework. You will need an account on https://app.serverless.com/. This account will have to be added to the `reflexer` organization.

Install serverless locally and authenticate to your serverless account with the CLI:

```
npm i -g serverless
serverless login
```

## Local testing & development

Run the pinger bots locally for testing and development on Kovan or Mainnet:

```
npm run local-kovan <PINGER BOT NAME>
npm run local-mainnet <PINGER BOT NAME>
```

**Important**: The command above will securely fetch the remote configuration from the serverless servers to run the function locally. It will also make you spend real ETH or KETH.

## Production deployment

The following commands will deploy all the Lambda functions from `serverless.yml` on AWS:

```
npm run deploy-kovan
npm run deploy-mainnet
```

To remove the deployment and cleanup all AWS resources, do:

```
serverless remove --stage kovan
serverless remove --stage mainnet
```

## CI & CD

Any changes merged and pushed to the `kovan` and `mainnet` branches will automatically be deployed by the serverless CD service. We recommend that you simply push changes to these branches after modifying the bots.

## Configuration

Bot environment variables can be configured from the serverless dashboard:

- Mainnet: https://app.serverless.com/reflexer/apps/geb-pinger-bots/geb-pinger-bots/settings/stages/mainnet
- Kovan: https://app.serverless.com/reflexer/apps/geb-pinger-bots/geb-pinger-bots/settings/stages/kovan

After changing a variable, the bots also need to be redeployed. To do that, open the serverless dashboard and go to App -> Kovan/Mainnet -> Deploys and click on "Redeploy".

All environment variables are exclusively read from the `src/index.ts` file.

Currently, the following variables are available:

- `ETH_RPC`: comma separated list of Ethereum RPC nodes
- `ACCOUNTS_PASSPHRASE`: secret passphrase used to derive Ethereum addresses for the pingers. Each bot uses its own address. The derivation method used is the standard. Each bot has a derivation path such as `m/44'/60'/0'/0/0`, `m/44'/60'/0'/0/1`, etc. *Tip*: use a tool like https://iancoleman.io/bip39/ to manage the pinger keys
- `MEDIANIZER_ETH_ADDRESS`: address of the ETH medianizer contract
- `MEDIANIZER_RAI_ADDRESS`: address of the RAI medianizer contract
- `FSM_ETH_ADDRESS`: address of the ETH FSM contract
- `FSM_RAI_ADDRESS`: address of the ETH FSM contract
- `ORACLE_RELAYER_ADDRESS`: address of the OracleRelayer contract
- `TAX_COLLECTOR_ADDRESS`: address of the TaxCollector contract
- `RATE_SETTER_ADDRESS`: address of the rate setter contract (PID)
- `STABILITY_FEE_TREASURY_ADDRESS`: address of the stability fee treasury contract
- `DS_PAUSE_ADDRESS`: address of the DSPause contract
- `ACCOUNTING_ENGINE_ADDRESS`: address of the AccountingEngine contract
- `SAFE_ENGINE_ADDRESS`: address of the SafeEngine contract
- `GNOSIS_SAFE`: address of the Gnosis Safe administration multisig
- `MIN_ETH_BALANCE`: minimum amount of ETH balance needed in a single pinger bot
- `REWARD_RECEIVER`: receiving address for caller rewards (surplus from the stability fee treasury)
- `SCHEDULER_INTERVAL_ETH_MEDIAN`: interval period at which the ETH median pinger is called
- `SCHEDULER_INTERVAL_RAI_MEDIAN`: interval period at which the RAI median pinger is called
- `SCHEDULER_INTERVAL_ETH_FSM`: interval period at which the ETH FSM pinger is called
- `SCHEDULER_INTERVAL_RAI_FSM` : interval period at which the RAI FSM pinger is called
- `TWILIO_AUTH_TOKEN`: Twilio secret for SMS alerts
- `TWILIO_SEND_NUMBER`: Twilio alert sending number
- `TWILIO_SID`: Twilio API key ID for SMS alerts
- `PHONE_NOTIFICATION_RECEIVER`: list of phone numbers with specified timezones and available hours for SMS alerts. Example: `[{"phone":"+33642967302","timeZone":"Europe/Zurich","available":"8-20"},{"phone":"+447775456404","timeZone":"Europe/London","available":"10-2"}]`
- `GEB_SUBGRAPH_URL`: comma separated list of subgraph nodes
- `AWS_SECRET`: AWS deploy key
- `AWS_ID`: AWS deploy ID
- `STATUS_BUCKET`: AWS bucket name for the status page
- `SLACK_HOOK_ERROR_URL`: Slack hook to send error notifications to
- `SLACK_HOOK_MULTISIG_URL`: Slack hook to send multisig notifications to
- `MIN_UPDATE_INTERVAL`: minimum time interval at which the pinger will send a transaction. Note that the other `SCHEDULER_INTERVAL_*` params above are specific frequencies for several Lambda function calls. Usually `SCHEDULER_INTERVAL_*` will be set to smaller values than this variable

The above variables cover the most important pinger bot parameters. Some additional useful configurations are located in `src/index.ts`. For example, you can include/exclude a bot from the balance checker, set the alert threshold of the liveness checker, etc.
