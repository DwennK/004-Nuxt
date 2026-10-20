import { createClient } from '@libsql/client'
import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../db/schema'

const relations = defineRelations(schema)

export type PosDatabase = ReturnType<typeof drizzle<typeof relations>>
export type PosTransaction = Parameters<Parameters<PosDatabase['transaction']>[0]>[0]
export type PosDatabaseExecutor = PosDatabase | PosTransaction

export function useTursoClient() {
  const config = useRuntimeConfig()
  const url = config.tursoUrl || process.env.TURSO_URL || process.env.NUXT_TURSO_URL
  const authToken = config.tursoToken || process.env.TURSO_TOKEN || process.env.NUXT_TURSO_TOKEN

  if (!url || !authToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Turso configuration is missing'
    })
  }

  // libSQL keeps pending streams and a concurrency queue on each client.
  // Sharing it across Worker invocations lets abandoned I/O block later requests.
  return createClient({
    url,
    authToken
  })
}

export function useDb() {
  return drizzle({ client: useTursoClient(), relations })
}
