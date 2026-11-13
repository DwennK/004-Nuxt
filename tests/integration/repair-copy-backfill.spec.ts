import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { backfillRepairCopy } from '../../scripts/db/backfill-repair-copy.mjs'

describe('repair copy backfill', () => {
  it('backs up before changing copy, preserves unrelated values and supports reruns', async () => {
    const client = createClient({ url: ':memory:' })
    try {
      await client.execute('CREATE TABLE catalog_items (id INTEGER PRIMARY KEY, type TEXT, name TEXT, model TEXT, service_kind TEXT, default_price INTEGER, sku TEXT, mobilesentrix_json TEXT, updated_at TEXT)')
      await client.execute('INSERT INTO catalog_items VALUES (1, \'repair\', \'Remplacement batterie iPhone 13\', \'iPhone 13\', \'Remplacement batterie\', 9900, \'00123\', \'{"status":"matched"}\', \'before\'), (2, \'repair\', \'Caméra avant iPhone 13\', \'iPhone 13\', \'Intervention personnalisée\', 12300, NULL, NULL, \'before\'), (3, \'product\', \'Batterie\', NULL, \'Remplacement batterie\', 1000, NULL, NULL, \'before\')')
      const before = (await client.execute('SELECT * FROM catalog_items ORDER BY id')).rows
      const preview = await backfillRepairCopy(client)
      expect(preview.changes).toHaveLength(2)
      expect((await client.execute('SELECT * FROM catalog_items ORDER BY id')).rows).toEqual(before)
      await expect(backfillRepairCopy(client, { apply: true, saveBackup: async () => {
        throw new Error('backup unavailable')
      } })).rejects.toThrow('backup unavailable')
      expect((await client.execute('SELECT * FROM catalog_items ORDER BY id')).rows).toEqual(before)
      let backup
      const result = await backfillRepairCopy(client, { apply: true, saveBackup: async (rows: unknown) => {
        backup = rows
      } })
      expect(backup).toEqual(before.slice(0, 2))
      expect(result.updated).toBe(2)
      const after = (await client.execute('SELECT * FROM catalog_items ORDER BY id')).rows
      expect(after[0]).toMatchObject({ name: 'Batterie — iPhone 13', default_price: 9900, sku: '00123', mobilesentrix_json: '{"status":"matched"}' })
      expect(after[1]?.service_kind).toBe('Intervention personnalisée')
      expect(after[2]).toEqual(before[2])
      expect((await backfillRepairCopy(client)).changes).toEqual([])
    } finally {
      client.close()
    }
  })
})
