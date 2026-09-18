import { withBackupAdmin } from '~~/server/utils/backups/http'
import { runBackup } from '~~/server/utils/backups/service'

export default eventHandler(event => withBackupAdmin(event, async ({ client, dropbox, turso }) => ({
  id: await runBackup(client, dropbox, 'manual', turso)
})))
