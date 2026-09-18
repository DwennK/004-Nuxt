import { withBackupAdmin, backupOAuthSession } from '~~/server/utils/backups/http'
import { requireBackupConfig, requireBackupSchema } from '~~/server/utils/backups/service'

export default eventHandler(event => withBackupAdmin(event, async ({ client, dropbox }, userId) => {
  requireBackupConfig(dropbox)
  await requireBackupSchema(client)
  const state = crypto.randomUUID()
  const session = await backupOAuthSession(event, dropbox.encryptionKey)
  await session.update({ state, userId })
  const url = new URL('https://www.dropbox.com/oauth2/authorize')
  url.search = new URLSearchParams({
    client_id: dropbox.appKey,
    redirect_uri: dropbox.redirectUri,
    response_type: 'code',
    token_access_type: 'offline',
    scope: 'account_info.read files.content.write',
    state
  }).toString()
  return { url: url.toString() }
}))
