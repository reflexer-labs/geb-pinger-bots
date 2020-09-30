import Axios from 'axios'
import Twilio from 'twilio'

export class Notifier {
  constructor(
    private slackHookUrl: string,
    private twilioAuthToken: string,
    private twilioSid: string,
    private twilioSendNumber: string
  ) {}

  public async sendAllChannels(message) {
    message = this.formatMessage(message)

    // Log
    this.logError(message)

    // Slack notification
    await this.slackError(message)

    // Twilio notification
    await this.twilioError(message)
  }
  private formatMessage(message: string): string {
    return `ERROR ${process.env.AWS_REGION}:${process.env.AWS_LAMBDA_FUNCTION_NAME}: ${message}`
  }

  public logError(message) {
    console.error(message)
  }

  public async slackError(message) {
    if (this.slackHookUrl) {
      await Axios.post(this.slackHookUrl, { text: message })
    }
  }

  public async twilioError(message) {
    const sendTwilioMessage = async (to, message) => {
      const twilio = Twilio(this.twilioSid, this.twilioAuthToken)
      const sendNumber = this.twilioSendNumber
      return new Promise(function (resolve, reject) {
        twilio.messages.create(
          {
            from: sendNumber,
            to: to,
            body: message,
          },
          (err, res) => (err ? reject(err) : resolve(res))
        )
      }).catch(() => {
        return 0
      })
    }

    // for (var i = 0; i < twilio_admins.length; i++) {
    //     try {
    //       canMessage = await canMessageAdmin(twilio_admins[i]);
    //       if (canMessage) {
    //         await sendTwilioMessage(twilio_admins[i].number, priceSource, errorToReport);
    //       }
    //     } catch(err) {}
    //   }
  }
}
