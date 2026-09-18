import { backupSettingsInputSchema } from '~~/shared/validation/backups'
import { withBackupAdmin } from '~~/server/utils/backups/http'
import { getBackupStatus, requireBackupConfig, requireBackupSchema } from '~~/server/utils/backups/service'

export default eventHandler(event => withBackupAdmin(event, async ({ client, dropbox }) => {
  const body = await readValidatedBody(event, backupSettingsInputSchema.parse)
  await requireBackupSchema(client)
  if (body.dailyEnabled) requireBackupConfig(dropbox)
  const result = await client.execute({
    sql: 'UPDATE backup_settings SET daily_enabled=? WHERE id=1 AND refresh_token_encrypted IS NOT NULL',
    args: [body.dailyEnabled ? 1 : 0]
  })
  if (!result.rowsAffected) throw createError({ statusCode: 409, message: 'Connectez Dropbox avant d’activer les sauvegardes.' })
  return getBackupStatus(client, dropbox)
}))
