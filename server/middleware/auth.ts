export default defineEventHandler(async (event) => {
  const path = event.path || ''

  if (!path.startsWith('/api/')) {
    return
  }

  if (path.startsWith('/api/auth/')) {
    return
  }

  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Non authentifié'
    })
  }
})
