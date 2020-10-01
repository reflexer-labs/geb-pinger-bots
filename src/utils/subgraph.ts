import Axios from 'axios'
import { notifier } from '..'

export const graphQlQuery = async (url: string, query: string) => {
  try {
    const resp = await Axios.post(url, {
      query,
    })
    return resp.data.data
  } catch (err) {
    const message = `Error querying graph node: ${err}`
    notifier.sendAllChannels(message)
    throw new Error(message)
  }
}
