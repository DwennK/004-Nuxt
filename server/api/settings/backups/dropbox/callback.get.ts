import { withBackupAdmin, backupOAuthSession } from '~~/server/utils/backups/http'
import { requireBackupConfig, requireBackupSchema } from '~~/server/utils/backups/service'
import { dropboxToken, dropboxAccount } from '~~/server/utils/backups/dropbox'
import { encryptBackupToken } from '~~/server/utils/backups/crypto'

export default eventHandler(event => withBackupAdmin(event, async ({ client, dropbox }, userId) => {
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
  requireBackupConfig(dropbox)
  await requireBackupSchema(client)
  const session = await backupOAuthSession(event, dropbox.encryptionKey)
  const query = getQuery(event)
  const validState = typeof query.state === 'string' && query.state === session.data.state && session.data.userId === userId
  await session.clear()
  if (!validState) return sendRedirect(event, '/settings/backups?dropbox=invalid_state')
  if (query.error || typeof query.code !== 'string') return sendRedirect(event, '/settings/backups?dropbox=cancelled')
  try {
    const token = await dropboxToken(dropbox, { grant_type: 'authorization_code', code: query.code, redirect_uri: dropbox.redirectUri })
    if (!token.refresh_token) throw new Error('Missing refresh token')
    const email = await dropboxAccount(token.access_token)
    const encrypted = await encryptBackupToken(token.refresh_token, dropbox.encryptionKey)
    const result = await client.execute({
      sql: `INSERT INTO backup_settings(id,refresh_token_encrypted,account_email,daily_enabled)
        SELECT 1,?,?,0 WHERE NOT EXISTS(SELECT 1 FROM backup_runs WHERE status='running' AND started_at>?)
        ON CONFLICT(id) DO UPDATE SET refresh_token_encrypted=excluded.refresh_token_encrypted,account_email=excluded.account_email,daily_enabled=0`,
      args: [encrypted, email, Date.now() - 15 * 60 * 1000]
    })
    if (!result.rowsAffected) return sendRedirect(event, '/settings/backups?dropbox=busy')
    return sendRedirect(event, '/settings/backups?dropbox=connected')
  } catch {
    return sendRedirect(event, '/settings/backups?dropbox=failed')
  }
}))
