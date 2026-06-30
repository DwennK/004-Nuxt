import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { users } from '~~/server/db/schema'
import { useDb } from '~~/server/utils/turso'

export type ActiveSessionUser = {
  id: number
  email: string
  name: string
  isAdmin: boolean
}

export async function resolveActiveSessionUser(event: H3Event) {
  const session = await getUserSession(event)
  const sessionUser = session.user as {
    id?: number
    email?: string
    name?: string
    isAdmin?: boolean
  } | undefined

  if (!sessionUser?.id) {
    return null
  }

  const db = useDb()
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
      isAdmin: users.isAdmin
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1)

  if (!user || !user.isActive) {
    await clearUserSession(event)
    return null
  }

  if (
    user.email !== sessionUser.email
    || user.name !== sessionUser.name
    || user.isAdmin !== sessionUser.isAdmin
  ) {
    await replaceUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin
      }
    })
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin
  } satisfies ActiveSessionUser
}

export async function requireActiveSessionUser(event: H3Event) {
  const user = await resolveActiveSessionUser(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Session invalide'
    })
  }

  return user
}

export async function requireAdminSessionUser(event: H3Event) {
  const user = await requireActiveSessionUser(event)

  if (!user.isAdmin) {
    throw createError({
      statusCode: 403,
      message: 'Accès administrateur requis'
    })
  }

  return user
}
