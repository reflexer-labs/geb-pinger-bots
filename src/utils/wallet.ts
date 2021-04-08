import { ethers } from 'ethers'
import { PingerAccount } from '../chains/accounts'
import { RPC_FAILED_TIMEOUT, RPC_STALL_TIMEOUT } from './constants'

export const getPrivateKeyFromHdWallet = (passphrase: string, index: number) => {
  const hdWallet = ethers.utils.HDNode.fromMnemonic(passphrase)
  // Default path m/44'/60'/0'/0/0
  const path = ethers.utils.defaultPath.slice(0, -1) + index.toString()
  return hdWallet.derivePath(path)
}

export const getAddress = (passphrase: string, account: PingerAccount) => {
  const hdNode = getPrivateKeyFromHdWallet(passphrase, account)
  return ethers.utils.computeAddress(hdNode.privateKey)
}

export const getWallet = async (
  ethRpc: string,
  passphrase: string,
  account: PingerAccount,
  network: string
) => {
  const provider = await getProvider(ethRpc, network)
  return new ethers.Wallet(getPrivateKeyFromHdWallet(passphrase, account).privateKey, provider)
}

export const getProvider = async (ethRpc: string, network: string) => {
  // Get the list of urls into an array
  const urls = ethRpc.split(',')

  // Create the individual providers
  let providers = urls.map((x) => {
    let provider: ethers.providers.StaticJsonRpcProvider
    provider = new ethers.providers.StaticJsonRpcProvider(
      { url: x, timeout: RPC_FAILED_TIMEOUT },
      network
    )

    // To debug do:
    provider.on('debug', (x) =>
      console.log(
        `${x.action} - ${x.request.method} - ${x.provider.connection.url} - ${
          x.error ? 'ERROR' + JSON.stringify(x.error) : 'OK ' + x.response
        }`
      )
    )

    return provider
  })

  const quorum = Math.max(Math.floor((urls.length - 1) / 2), 1)

  const providerConfigs = providers.map((p, i) => ({
    provider: p,
    // Assign a priority based on the order in the list
    // We need a priority to use the same node as much as possible and avoid nodes in different sync stages
    priority: i + 1,
    // If a node did not reply within 3s, go to the next one
    stallTimeout: RPC_STALL_TIMEOUT,
  }))

  const fallBackProvider = new ethers.providers.FallbackProvider(providerConfigs, quorum)

  return fallBackProvider
}
