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

export const getWallet = (ethRpc: string, passphrase: string, account: PingerAccount) => {
  const provider = getProvider(ethRpc)
  return new ethers.Wallet(getPrivateKeyFromHdWallet(passphrase, account).privateKey, provider)
}

export const getProvider = (ethRpc: string) => {
  // Setup a redundant provider with a quorum of 1
  const urls = ethRpc.split(',')
  const provider = new ethers.providers.FallbackProvider(
    urls.map((x) => {
      let provider: ethers.providers.Provider
      if (x.search('infura.io') > -1) {
        // Extract the network and the key from the URL
        let net = (x.match(/\w*(?=\.infura\.io)/g) as string[])[0]
        let key = (x.match(/(?<=\.infura\.io\/.*\/)\w*/g) as string[])[0]
        provider = new ethers.providers.InfuraProvider(net, key)
      } else {
        provider = new ethers.providers.JsonRpcProvider({
          url: x,
          timeout: 5000,
          throttleLimit: 4,
          throttleCallback: async (a, u) => {
            console.log(`RPC throttled, call attempt ${a} url: ${u}`)
            return true
          },
        })
      }

      return {
        provider: provider,
        priority: 1,
        stallTimeout: 5000,
      }
    }),
    1
  )

  return provider
}
