import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { syncTacDataset, tacClient } from '~~/server/utils/tac-sync'
import { TacError } from '~~/server/utils/tac-dataset'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (getHeader(event, 'origin') !== getRequestURL(event).origin) {
    throw createError({ statusCode: 403, message: 'Origine de la requête invalide.' })
  }
  const client = tacClient(event)
  try {
    return await syncTacDataset(client)
  } catch (error) {
    const code = error instanceof TacError ? error.message : 'sync_failed'
    throw createError({ statusCode: 503, message: 'Synchronisation TAC indisponible.', data: { code } })
  } finally {
    client.close()
  }
})
