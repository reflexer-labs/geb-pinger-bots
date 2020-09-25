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
    const provider = new ethers.providers.JsonRpcProvider(ethRpc)
    return new ethers.Wallet(getPrivateKeyFromHdWallet(passphrase, account).privateKey, provider)
}
