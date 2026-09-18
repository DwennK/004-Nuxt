import { withBackupAdmin } from '~~/server/utils/backups/http'
import { requireBackupSchema } from '~~/server/utils/backups/service'

export default eventHandler(event => withBackupAdmin(event, async ({ client }) => {
  await requireBackupSchema(client)
  const result = await client.execute({
    sql: `UPDATE backup_settings SET refresh_token_encrypted=NULL,account_email=NULL,daily_enabled=0
      WHERE id=1 AND NOT EXISTS(SELECT 1 FROM backup_runs WHERE status='running' AND started_at>?)`,
    args: [Date.now() - 15 * 60 * 1000]
  })
  if (!result.rowsAffected) throw createError({ statusCode: 409, message: 'Attendez la fin de la sauvegarde avant de déconnecter Dropbox.' })
  return { disconnected: true }
}))
