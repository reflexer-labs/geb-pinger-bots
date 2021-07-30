# Geb Pinger Bots

## Overview

This repo is a collection of AWS Lambda functions built with the serverless framework which are meant to perform tasks on a GEB deployment. These functions mainly do 2 things:

- Call non authed smart contract functions that need to be updated periodically or upon a specific event
- Monitor the health of smart-contracts and system services and send errors if anomalies are detected

This repo includes the following bots:

- `updateUniswapCoinMedianizer` Call the update function of the system coin medianizer pulling the price from a Uniswap TWAP
- `updateETHFsm` Update the ETH FSM (OSM) and subsequently call the OracleRelayer contract to push the new price inside the core system
<!-- - `updateRateSetter` Call the on-chain controller to calculate and set a new redemption rate -->
- `updateTaxCollector` Call the Tax Collector to collect stability fees from open safes
- `updateStabilityFeeTreasury` Transfer any potential stability fee surplus from the treasury
- `pauseExecutor` Execute pending proposals from DSPause like contracts
- `debtSettler` Call the settle debt function in the AccountingEngine contract
- `ceilingSetter` Set the debt ceiling according to the current amount of RAI outstanding
- `collateralAuctionThrottler` Set the maximum amount of collateral that can be auctioned at once according to the amount of lock collateral
- `debtFloorAdjuster` Set the debt floor according to a gas oracle
- `autoSurplusAuctionedSetter` Set surplus auction parameters
- `autoSurplusBufferSetter` Set the surplus buffer size according to the locked collateral
- `debtAuctionInitialParameterSetter` Set debt auction parameters
- `balanceChecker` Check that the ETH balance of a pinger is sufficient to pay for gas costs
- `livenessChecker` Check that the the FSMs, medianizers and the TaxCollector were recently updated. Check that the Ethereum nodes used by the pinger are responsive and up to date. Check the the subgraph nodes are responsive and up to date. Send notifications upon detecting new multisig transactions. Update the status file at https://status.reflexer.finance/ or https://status-kovan.reflexer.finance/

## Setup

Clone the repo & install dependencies

```
git clone git@github.com:reflexer-labs/geb-pinger-bots.git
npm i
```

The pinger bots are deployed on AWS Lambda using the serverless framework. You will need an account on https://app.serverless.com/. This account will have to be added to the `reflexer` organization. You can change the organization/serverless account in the `serveless.yml` file.

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

- Mainnet: https://app.serverless.com/<ORG_NAME>/apps/geb-pinger-bots/geb-pinger-bots/settings/stages/mainnet
- Kovan: https://app.serverless.com/<ORG_NAME>/apps/geb-pinger-bots/geb-pinger-bots/settings/stages/kovan

After changing a variable, the bots also need to be redeployed. To do that, open the serverless dashboard and go to App -> Kovan/Mainnet -> Deploys and click on "Redeploy".

All environment variables are exclusively read from the `src/index.ts` file.

Currently, the following variables are available:

- `ETH_RPC`: comma separated list of Ethereum RPC nodes
- `ACCOUNTS_PASSPHRASE`: secret passphrase used to derive Ethereum addresses for pingers. Each bot uses its own address. The derivation method used is the standard one. Each bot has a derivation path such as `m/44'/60'/0'/0/0`, `m/44'/60'/0'/0/1`, etc. _Tip_: use a tool like https://iancoleman.io/bip39/ to manage pinger keys
- `SLACK_HOOK_ERROR_URL`: Slack hook to send error notifications to
- `SLACK_HOOK_MULTISIG_URL`: Slack hook to send multisig notifications to

Important configuration including contract addresses, execution interval and more is located in `config/config.mainnet.json` or `config/config.kovan.json`. These file currently contain the configuration the main RAI deployment.
