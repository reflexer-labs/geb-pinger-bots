import Axios from 'axios'
import Twilio from 'twilio'

type TwilioNotifyee = {
  // Phone number with country code
  phone: string
  // One of these string: http://worldtimeapi.org/api/timezone/
  timeZone: string
  // Time span available in 24h format separated by a dash, hour only. For example: "8-19" for 8am to 19pm or "10-2" for 10am to 2am.
  available: string
}

export class Notifier {
  constructor(
    private slackHookUrl: string,
    private twilioAuthToken: string,
    private twilioSid: string,
    private twilioSendNumber: string,
    private twilioNotifyees: TwilioNotifyee[]
  ) {}

  public async sendAllChannels(message) {
    message = this.formatMessage(message)

    // Log
    this.logError(message)

    // Slack notification
    // await this.slackError(message)

    // Twilio notification
    // await this.twilioError(message)
  }
  private formatMessage(message: string): string {
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
      })
    }

    for (let notifyee of this.twilioNotifyees) {
      // Check if we can send the notification to this number
      const hourInTimezone = parseInt(
        new Date()
          .toLocaleTimeString('en-US', { hour12: false, timeZone: notifyee.timeZone })
          .split(':')[0]
      )
      const startWork = parseInt(notifyee.available.split('-')[0])
      const endWork = parseInt(notifyee.available.split('-')[1])
      if (
        startWork === endWork ||
        (startWork <= endWork
          ? hourInTimezone >= startWork && hourInTimezone <= endWork
          : hourInTimezone >= startWork || hourInTimezone <= endWork) // Covers the case where the time span is across midnight
      ) {
        // We can send
        try {
          await sendTwilioMessage(notifyee.phone, message)
        } catch (err) {
          this.logError(`Twilio notification issue ${err}`)
        }
      }
    }
  }
}
