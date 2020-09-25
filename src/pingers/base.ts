import { ethers } from 'ethers'
import { TransactionRequest } from 'geb.js'
import { notifier } from '..'
import { Transactor } from '../chains/transactor'

export abstract class BasePinger {
    protected transactor: Transactor
    constructor(protected wallet: ethers.Signer) {
        this.transactor = new Transactor(this.wallet)
    }

    abstract async ping(): Promise<void>

    protected async sendPing(tx: TransactionRequest) {
        let txHash: string
        try {
            txHash = await this.transactor.ethSend(tx)
        } catch (err) {
            notifier.sendAllChannels(err)
            return
        }

        console.log(`Transaction sent ${txHash}`)
    }
}
