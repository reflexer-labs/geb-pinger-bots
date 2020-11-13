import { ethers } from 'ethers'
import { PingerAccount } from '../chains/accounts'

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
    provider = new ethers.providers.StaticJsonRpcProvider(x, network)

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

  // Use this for a 2 out of 5 quorum
  //const quorum = Math.max(Math.floor((urls.length - 1) / 2), 1)
  const quorum = 1

  const providerConfigs = providers.map((p) => ({
    provider: p,
    priority: 1,
  }))
  const fallBackProvider = new ethers.providers.FallbackProvider(providerConfigs, quorum)

  return fallBackProvider
}
