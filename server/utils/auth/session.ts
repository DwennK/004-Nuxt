import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { users } from '~~/server/db/schema'
import { useDb } from '~~/server/utils/turso'
import {
  hasCapability,
  listCapabilities,
  type AuthCapability
} from '~~/shared/utils/capabilities'

export type ActiveSessionUser = {
  id: number
  email: string
  name: string
  isAdmin: boolean
  capabilities: AuthCapability[]
}

export type RequestActor = {
  userId: number
  email: string
  name: string
  isAdmin: boolean
}

export type UseCaseContext = {
  requestId: string
  actor: RequestActor
}

export type AuthRequestContext = UseCaseContext & {
  user: ActiveSessionUser
  capabilities: AuthCapability[]
}

function toRequestActor(user: ActiveSessionUser): RequestActor {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin
  }
}

function setAuthRequestContext(event: H3Event, user: ActiveSessionUser) {
  const requestId = event.context.auth?.requestId || crypto.randomUUID()
  const auth = {
    requestId,
    actor: toRequestActor(user),
    user,
    capabilities: [...user.capabilities]
  } satisfies AuthRequestContext

  event.context.auth = auth
  event.context.requestId = requestId

  return auth
}

export function getAuthRequestContext(event: H3Event) {
  return event.context.auth as AuthRequestContext | undefined
}

export function getUseCaseContext(event: H3Event): UseCaseContext {
  const auth = getAuthRequestContext(event)

  if (!auth) {
    throw createError({
      statusCode: 500,
      message: 'Contexte de requête authentifié indisponible'
    })
  }

  return {
    requestId: auth.requestId,
    actor: auth.actor
  }
}

export async function resolveActiveSessionUser(event: H3Event) {
  const existingAuth = getAuthRequestContext(event)
  if (existingAuth) {
    return existingAuth.user
  }

  const session = await getUserSession(event)
  const sessionUser = session.user as {
    id?: number
    email?: string
    name?: string
    isAdmin?: boolean
    capabilities?: AuthCapability[]
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

  const capabilities = listCapabilities(user)
  const capabilitiesAreCurrent = sessionUser.capabilities?.length === capabilities.length
    && capabilities.every(capability => sessionUser.capabilities?.includes(capability))

  if (
    user.email !== sessionUser.email
    || user.name !== sessionUser.name
    || user.isAdmin !== sessionUser.isAdmin
    || !capabilitiesAreCurrent
  ) {
    await replaceUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        capabilities
      }
    })
  }

  const activeUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    capabilities
  } satisfies ActiveSessionUser

  setAuthRequestContext(event, activeUser)

  return activeUser
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
  const auth = await requireCapability(event, 'administration:manage', {
    message: 'Accès administrateur requis'
  })
  return auth.user
}

export async function requireCapability(
  event: H3Event,
  capability: AuthCapability,
  options?: { message?: string }
) {
  const user = await requireActiveSessionUser(event)

  if (!hasCapability(user, capability)) {
    throw createError({
      statusCode: 403,
      message: options?.message || `Capacité requise: ${capability}`
    })
  }

  return getAuthRequestContext(event)!
}
