import { readFile } from 'node:fs/promises'
import type { Client } from '@libsql/client'
import type { PosDatabase } from '../../server/utils/turso'
import {
  dossierSession,
  type DossierWriteContext
} from '../../server/utils/pos/dossiers'
import type { DossierTarget } from '../../shared/types/dossier'

export async function createDossierTables(client: Client) {
  await client.executeMultiple(
    await readFile(
      new URL(
        '../../drizzle/20260907224739_dossier_edit_sessions/migration.sql',
        import.meta.url
      ),
      'utf8'
    )
  )
}

export async function testDossierContext(
  db: PosDatabase,
  target: DossierTarget,
  standalone = false
): Promise<DossierWriteContext> {
  const tabId = crypto.randomUUID()
  const actor = { userId: 1, name: 'Test', isAdmin: true }
  const input = {
    target,
    tabId,
    station: 'Tests',
    action: 'observe' as const,
    intent: 'edit' as const,
    dirty: false,
    standalone
  }
  const seen = await dossierSession(input, actor, db)
  const owner = await dossierSession(
    { ...input, action: 'takeover', expectedGeneration: seen.generation },
    actor,
    db
  )
  return {
    userId: actor.userId,
    tabId,
    proofs: [{ key: owner.key, revision: owner.revision, token: owner.token! }]
  }
}
