import { resolveActiveSessionUser } from '~~/server/utils/auth/session'

export default defineEventHandler(async (event) => {
  const path = event.path || ''

  if (!path.startsWith('/api/')) {
    return
  }

  if (path.startsWith('/api/auth/') || path.startsWith('/api/_auth/')) {
    return
  }

  const user = await resolveActiveSessionUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Session invalide'
    })
  }
})
