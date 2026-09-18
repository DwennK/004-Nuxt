import { BACKUP_CRON, backupConfigured, backupContext, backupSchemaReady, runBackup } from '../utils/backups/service'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async ({ controller, env }) => {
    if (controller.cron !== BACKUP_CRON) return
    const { client, dropbox } = backupContext(undefined, env)
    try {
      // Deployment is inert until Dropbox is configured, connected and the
      // administrator explicitly enables the daily schedule in settings.
      if (!backupConfigured(dropbox) || !await backupSchemaReady(client)) return
      await runBackup(client, dropbox, 'scheduled', new Date(controller.scheduledTime).toISOString().slice(0, 10))
    } finally {
      client.close()
    }
  })
})
