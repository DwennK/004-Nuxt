import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

describe('Turso invocation isolation', () => {
  it.each(['client', 'drizzle'] as const)('does not let stalled %s calls block a later invocation', async (kind) => {
    vi.resetModules()
    vi.stubGlobal('useRuntimeConfig', () => ({
      tursoUrl: 'https://database.example.test',
      tursoToken: 'test-only'
    }))

    let requests = 0
    let release!: () => void
    const stalled = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal('fetch', vi.fn(async () => {
      const requestNumber = ++requests
      // Fill libSQL's default 20-slot limiter with unfinished I/O from an
      // earlier invocation. A later invocation must have its own limiter.
      if (requestNumber <= 20) await stalled
      return Response.json({
        baton: null,
        base_url: null,
        results: [
          {
            type: 'ok',
            response: {
              type: 'execute',
              result: {
                cols: [{ name: 'value', decltype: 'INTEGER' }],
                rows: [[{ type: 'integer', value: '1' }]],
                affected_row_count: 0,
                last_insert_rowid: null
              }
            }
          },
          { type: 'ok', response: { type: 'close' } }
        ]
      })
    }))

    const { useDb, useTursoClient } = await import('../../server/utils/turso')
    const connect = () => {
      if (kind === 'client') {
        const client = useTursoClient()
        return { read: () => client.execute('SELECT 1 AS value'), close: () => client.close() }
      }
      const db = useDb()
      return { read: () => db.get(sql`SELECT 1 AS value`), close: () => db.$client.close() }
    }
    const earlier = connect()
    const pending = Array.from({ length: 20 }, () => Promise.resolve(earlier.read()))
    let later: ReturnType<typeof connect> | undefined
    let next: Promise<unknown> | undefined
    try {
      await vi.waitFor(() => expect(requests).toBe(20))
      later = connect()
      next = Promise.resolve(later.read())
      await vi.waitFor(() => expect(requests).toBe(21), { timeout: 1000 })
      expect(await next).toBeDefined()
    } finally {
      release()
      await Promise.allSettled([...pending, ...(next ? [next] : [])])
      earlier.close()
      later?.close()
    }
  }, 20000)
})
