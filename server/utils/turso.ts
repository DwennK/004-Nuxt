import { createClient } from '@libsql/client'

let client: ReturnType<typeof createClient> | null = null

export function useTursoClient() {
  if (client) {
    return client
  }

  const config = useRuntimeConfig()
  const url = config.tursoUrl
  const authToken = config.tursoToken

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
