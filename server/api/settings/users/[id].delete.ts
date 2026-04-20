import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/db/schema'
import { useDb } from '~~/server/utils/turso'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const session = await requireUserSession(event)
  const sessionUserId = (session.user as { id?: number } | undefined)?.id

  if (params.id === sessionUserId) {
    throw createError({
      statusCode: 400,
      message: 'Vous ne pouvez pas supprimer votre propre compte'
    })
  }

  const db = useDb()
  const result = await db.delete(users).where(eq(users.id, params.id))

  const affected = Number(result.rowsAffected ?? 0)
  if (affected === 0) {
    throw createError({ statusCode: 404, message: 'Utilisateur introuvable' })
  }

  return { deleted: true }
})
