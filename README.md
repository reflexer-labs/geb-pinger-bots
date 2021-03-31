# Geb Pinger Bots

## Overview

This repo is a collection of AWS Lambda functions built with the serverless framework which are meant to perform tasks on a GEB deployment. These functions mainly do 2 things:

- Call non authed smart contract functions that need to be updated periodically or upon a specific event
- Monitor the health of smart-contracts and system services and send errors if anomalies are detected

This repo includes the following bots:

- `updateUniswapRAIMedianizer` Call the update function of the system coin medianizer pulling the price from a Uniswap TWAP
- `updateETHFsm` Update the ETH FSM (OSM) and subsequently call the OracleRelayer contract to push the new price inside the core system
- `updateRateSetter` Call the on-chain controller to calculate and set a new redemption rate
- `updateTaxCollector` Call the Tax Collector to collect stability fees from open safes
- `updateStabilityFeeTreasury` Transfer any potential stability fee surplus from the treasury
- `pauseExecutor` Execute pending proposals from DSPause like contracts
- `debtSettler` Call the settle debt function in the AccountingEngine contract
- `balanceChecker` Check that the ETH balance of a pinger is sufficient to pay for gas costs
- `livenessChecker` Check that the the FSMs, medianizers and the TaxCollector were recently updated. Check that the Ethereum nodes used by the pinger are responsive and up to date. Check the the subgraph nodes are responsive and up to date. Send notifications upon detecting new multisig transactions. Update the status file at https://status.reflexer.finance/ or https://status-kovan.reflexer.finance/

## Setup

Clone the repo & install dependencies

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
- `ACCOUNTS_PASSPHRASE`: secret passphrase used to derive Ethereum addresses for pingers. Each bot uses its own address. The derivation method used is the standard one. Each bot has a derivation path such as `m/44'/60'/0'/0/0`, `m/44'/60'/0'/0/1`, etc. _Tip_: use a tool like https://iancoleman.io/bip39/ to manage pinger keys
- `MEDIANIZER_ETH_ADDRESS`: address of the ETH medianizer contract
- `MEDIANIZER_RAI_ADDRESS`: address of the system coin medianizer contract
- `FSM_ETH_ADDRESS`: address of the ETH FSM contract
- `ORACLE_RELAYER_ADDRESS`: address of the OracleRelayer contract
- `TAX_COLLECTOR_ADDRESS`: address of the TaxCollector contract
- `RATE_SETTER_ADDRESS`: address of the rate setter contract (on-chain controller)
- `STABILITY_FEE_TREASURY_ADDRESS`: address of the stability fee treasury contract
- `DS_PAUSE_ADDRESS`: address of the DSPause contract
- `ACCOUNTING_ENGINE_ADDRESS`: address of the AccountingEngine contract
- `SAFE_ENGINE_ADDRESS`: address of the SafeEngine contract
- `GNOSIS_SAFE`: address of the Gnosis Safe administration multisig
- `MIN_ETH_BALANCE`: minimum amount of ETH balance needed in a single pinger bot
- `REWARD_RECEIVER`: receiving address for caller rewards (surplus coming from the stability fee treasury)
- `SCHEDULER_INTERVAL_ETH_MEDIAN`: interval period at which the ETH median pinger is called
- `SCHEDULER_INTERVAL_RAI_MEDIAN`: interval period at which the system coin median pinger is called
- `SCHEDULER_INTERVAL_ETH_FSM`: interval period at which the ETH FSM pinger is called
- `SCHEDULER_INTERVAL_RATE_SETTER` : interval period at which the rate setter pinger is called
- `TWILIO_AUTH_TOKEN`: Twilio secret for SMS alerts
- `TWILIO_SEND_NUMBER`: Twilio alert sending number
- `TWILIO_SID`: Twilio API key ID for SMS alerts
- `PHONE_NOTIFICATION_RECEIVER`: list of phone numbers with specified timezones and available hours for SMS alerts. Example: `[{"phone":"+33376233981","timeZone":"Europe/Zurich","available":"8-20"},{"phone":"+448885859181","timeZone":"Europe/London","available":"10-2"}]`
- `GEB_SUBGRAPH_URL`: comma separated list of subgraph nodes
- `AWS_SECRET`: AWS deploy key
- `AWS_ID`: AWS deploy ID
- `STATUS_BUCKET`: AWS bucket name for the status page
- `SLACK_HOOK_ERROR_URL`: Slack hook to send error notifications to
- `SLACK_HOOK_MULTISIG_URL`: Slack hook to send multisig notifications to
- `MIN_UPDATE_INTERVAL_ETH_MEDIAN`: Default minimum time interval in minutes at which the pinger will send a transaction. Note that the other `SCHEDULER_INTERVAL_*` params above are specific frequencies for several Lambda function calls. Usually `SCHEDULER_INTERVAL_*` will be set to smaller values than this variable
- `MIN_UPDATE_INTERVAL_RAI_MEDIAN`: Same as above for the system coin median pinger
- `MIN_UPDATE_INTERVAL_ETH_FSM`: Same as above for the ETH FSM pinger
- `MIN_UPDATE_INTERVAL_RATE_SETTER`: Same as above for the rate setter pinger
- `MIN_UPDATE_INTERVAL_TAX_COLLECTOR`: Same as above for the tax collector pinger

The above variables cover the most important pinger bot parameters. Some additional useful configurations are located in `src/index.ts`. For example, you can include/exclude a bot from the balance checker, set the alert threshold for the liveness checker, etc.
