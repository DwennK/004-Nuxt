import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../db/schema'

let client: ReturnType<typeof createClient> | null = null
let db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function useTursoClient() {
  if (client) {
    return client
  }

  const config = useRuntimeConfig()
  const url = config.tursoUrl || process.env.TURSO_URL || process.env.NUXT_TURSO_URL
  const authToken = config.tursoToken || process.env.TURSO_TOKEN || process.env.NUXT_TURSO_TOKEN

  if (!url || !authToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Turso configuration is missing'
    })
  }

  client = createClient({
    url,
    authToken
  })

  return client
}

export function useDb() {
  if (db) {
    return db
  }

  db = drizzle(useTursoClient(), { schema })

  return db
}
