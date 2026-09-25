import type { Client } from '@libsql/client'
import type { SmartphoneImeiLookup } from '~~/shared/types/smartphones'
import { smartphoneImeiLookupSchema } from '~~/shared/validation/smartphones'

export async function lookupSmartphoneImei(imei: string, client: Client): Promise<SmartphoneImeiLookup> {
  const tac = smartphoneImeiLookupSchema.parse({ imei }).imei.slice(0, 8)
  try {
    // One statement pins the active version and block to the same DB snapshot.
    const result = await client.execute({
      sql: `SELECT s.active_version, b.payload FROM tac_sync_state s
        LEFT JOIN tac_blocks b ON b.version=s.active_version AND b.prefix=? WHERE s.id=1`,
      args: [tac.slice(0, 3)]
    })
    const row = result.rows[0]
    if (!row?.active_version) return { status: 'unavailable' }
    if (!row.payload) return { status: 'not_found' }
    const model: unknown = JSON.parse(String(row.payload))[tac]
    if (typeof model === 'string' && model.length >= 2 && model.length <= 200) return { status: 'found', model }
    return { status: 'not_found' }
  } catch {
    return { status: 'unavailable' }
  }
}
