import { emailEventsQueue } from '~~/shared/constants/email'
import { consumeEmailEvents } from '../utils/email/events'
import { parseMailAddress } from '../utils/email/transport'
import { useDb } from '../utils/turso'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:queue', async ({ batch }) => {
    if (batch.queue !== emailEventsQueue) return
    const config = useRuntimeConfig()
    const from = parseMailAddress(config.mailFrom || '')
    await consumeEmailEvents(batch, useDb(), typeof from === 'string' ? from : from.email)
  })
})
