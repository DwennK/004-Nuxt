import { resolveActiveSessionUser } from '~~/server/utils/auth/session'

export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    const user = await resolveActiveSessionUser(event)
    if (!user && session.user) {
      throw createError({
        statusCode: 401,
        message: 'Session invalide'
      })
    }
  })
})
