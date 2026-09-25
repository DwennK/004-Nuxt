import { TAC_CRON, TacError } from '../utils/tac-dataset'
import { syncTacDataset, tacClient } from '../utils/tac-sync'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async ({ controller, env }) => {
    if (controller.cron !== TAC_CRON) return
    const client = tacClient(undefined, env)
    try {
      const result = await syncTacDataset(client)
      console.info(JSON.stringify({ scope: 'tac-sync', status: result.status }))
    } catch (error) {
      const code = error instanceof TacError ? error.message : 'sync_failed'
      console.error(JSON.stringify({ scope: 'tac-sync', code }))
      throw new TacError(code)
    } finally {
      client.close()
    }
  })
})
