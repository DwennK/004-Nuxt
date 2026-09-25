import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { getTacStatus, tacClient } from '~~/server/utils/tac-sync'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const client = tacClient(event)
  try {
    return await getTacStatus(client)
  } finally {
    client.close()
  }
})
