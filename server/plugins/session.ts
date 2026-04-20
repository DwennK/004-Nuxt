import { eq } from 'drizzle-orm'
import { users } from '~~/server/db/schema'
import { useDb } from '~~/server/utils/turso'

export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    const sessionUser = session.user as {
      id?: number
      email?: string
      name?: string
    } | undefined

    if (!sessionUser?.id) {
      return
    }

    const db = useDb()
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isActive: users.isActive
      })
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1)

    if (!user || !user.isActive) {
      await clearUserSession(event)
      throw createError({
        statusCode: 401,
        message: 'Session invalide'
      })
    }

    if (user.email !== sessionUser.email || user.name !== sessionUser.name) {
      await replaceUserSession(event, {
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      })
    }
  })
})
