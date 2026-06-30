import { eq, and, ne } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/db/schema'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { getUserById } from '~~/server/utils/users'
import { useDb } from '~~/server/utils/turso'
import { updateUserSchema } from '~~/shared/validation/users'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const sessionUser = await requireAdminSessionUser(event)
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, updateUserSchema.parse)

  const target = await getUserById(params.id)
  if (!target) {
    throw createError({ statusCode: 404, message: 'Utilisateur introuvable' })
  }

  if (body.isActive === false && params.id === sessionUser.id) {
    throw createError({
      statusCode: 400,
      message: 'Vous ne pouvez pas désactiver votre propre compte'
    })
  }

  if (body.isAdmin === false && params.id === sessionUser.id) {
    throw createError({
      statusCode: 400,
      message: 'Vous ne pouvez pas retirer vos propres droits administrateur'
    })
  }

  const db = useDb()

  if (body.email && body.email !== target.email) {
    const [conflict] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, body.email), ne(users.id, params.id)))
      .limit(1)
    if (conflict) {
      throw createError({
        statusCode: 409,
        message: 'Un autre compte utilise déjà cet email'
      })
    }
  }

  const updates: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date().toISOString()
  }
  if (body.email !== undefined) updates.email = body.email
  if (body.name !== undefined) updates.name = body.name
  if (body.isActive !== undefined) updates.isActive = body.isActive
  if (body.isAdmin !== undefined) updates.isAdmin = body.isAdmin

  await db.update(users).set(updates).where(eq(users.id, params.id))

  const fresh = await getUserById(params.id)
  if (!fresh) {
    throw createError({ statusCode: 500, message: 'Utilisateur introuvable après mise à jour' })
  }
  return fresh
})
