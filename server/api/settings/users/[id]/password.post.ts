import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/db/schema'
import { getUserById } from '~~/server/utils/users'
import { useDb } from '~~/server/utils/turso'
import { changePasswordSchema } from '~~/shared/validation/users'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, changePasswordSchema.parse)

  const target = await getUserById(params.id)
  if (!target) {
    throw createError({ statusCode: 404, message: 'Utilisateur introuvable' })
  }

  const passwordHash = await hashPassword(body.password)
  const db = useDb()

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(users.id, params.id))

  return { ok: true }
})
