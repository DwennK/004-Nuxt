import { withBackupAdmin } from '~~/server/utils/backups/http'
import { getBackupStatus } from '~~/server/utils/backups/service'

export default eventHandler(event => withBackupAdmin(event, ({ client, dropbox }) => getBackupStatus(client, dropbox)))
