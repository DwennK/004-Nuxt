export default defineEventHandler(async (event) => {
  const path = event.path || ''

  if (!path.startsWith('/api/')) {
    return
  }

  if (path.startsWith('/api/auth/') || path.startsWith('/api/_auth/')) {
    return
  }

  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({
      statusCode: 401,
      message: 'Non authentifié'
    })
  }
})
