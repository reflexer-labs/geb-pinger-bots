import Axios from 'axios'

export class Notifier {
  constructor(private errorSlackHookUrl: string, private multisigSlackHookUrl: string) {}

  public async sendError(message) {
    message = this.formatErrorMessage(message)

    // Log
    this.logError(message)

    // Slack notification
    await this.slackError(message)
  }

  public async sendMultisigMessage(message) {
    message = this.formatMultisigMessage(message)
    await this.slackMultisigNotification(message)
  }

  private formatMultisigMessage(message: string): string {
    const network = (process.env.AWS_LAMBDA_FUNCTION_NAME as string).split('-')[3]
    return `Multisig notification
  Network: ${network}
  Details: ${message}
`
  }

  private formatErrorMessage(message: string): string {
    const botName = (process.env.AWS_LAMBDA_FUNCTION_NAME as string).split('-')[4]
    const network = (process.env.AWS_LAMBDA_FUNCTION_NAME as string).split('-')[3]
    return `Geb pinger bot error
  Region: ${process.env.AWS_REGION}
  Network: ${network}
  Bot name: ${botName}
  Details: ${message}
`
  }

  public logError(message) {
    console.error(message)
  }

  private async slackError(message) {
    if (this.errorSlackHookUrl) {
      await Axios.post(this.errorSlackHookUrl, { text: message })
    }
  }

  private async slackMultisigNotification(message) {
    if (this.multisigSlackHookUrl) {
      await Axios.post(this.multisigSlackHookUrl, { text: message })
    }
  }
}
