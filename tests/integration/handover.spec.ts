import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PosDatabase } from '../../server/utils/turso'
import { getHandover, resolveHandover, updateHandover } from '../../server/utils/pos/handover'
import { connectShopify } from '../../server/utils/shopify/client'
import { fetchFulfillment, setFulfillment } from '../../server/utils/shopify/fulfillment'
import { createDossierTables, testDossierContext } from '../fixtures/dossiers'

vi.mock('../../server/utils/shopify/client', () => ({ connectShopify: vi.fn() }))
vi.mock('../../server/utils/shopify/fulfillment', () => ({ fetchFulfillment: vi.fn(), setFulfillment: vi.fn(), fulfillmentState: (state: unknown) => state }))
const event = {} as H3Event
const target = { kind: 'document' as const, id: 1 }
const config = { domain: 'test-pos.myshopify.com', clientId: '', clientSecret: '', accessToken: 'token' }
let client: ReturnType<typeof createClient>
let db: PosDatabase
let directory: string
async function collected() {
  return (await client.execute('SELECT collected FROM dossier_handovers')).rows[0]?.collected
}
async function link(documentId = 1, orderId = 1) {
  await client.execute({ sql: 'INSERT INTO document_imports (document_id, source, external_id, external_number, created_at) VALUES (?, ?, ?, ?, ?)', args: [documentId, 'shopify_order', `${config.domain}:gid://shopify/Order/${orderId}`, JSON.stringify({ version: 1, name: `#${orderId}`, fingerprint: 'fixture' }), 'now'] })
}
beforeEach(async () => {
  vi.clearAllMocks()
  directory = await mkdtemp(join(tmpdir(), 'pos-handover-'))
  client = createClient({ url: `file:${join(directory, 'test.sqlite')}` })
  db = drizzle({ client }) as unknown as PosDatabase
  await client.executeMultiple(`
    CREATE TABLE tickets (id INTEGER PRIMARY KEY);
    INSERT INTO tickets VALUES (1);
    CREATE TABLE documents (id INTEGER PRIMARY KEY, ticket_id INTEGER);
    INSERT INTO documents VALUES (1, 1), (2, 1), (3, NULL);
    CREATE TABLE document_imports (id INTEGER PRIMARY KEY, document_id INTEGER, source TEXT, external_id TEXT, external_number TEXT, created_at TEXT);
  `)
  await createDossierTables(client)
  await client.executeMultiple(await readFile(new URL('../../drizzle/20260923152440_dossier_handover/migration.sql', import.meta.url), 'utf8'))
  await client.executeMultiple(await readFile(new URL('../../drizzle/20260925120449_handover_local_pickup/migration.sql', import.meta.url), 'utf8'))
  vi.mocked(connectShopify).mockResolvedValue({ config, name: 'Test', allOrders: false })
  vi.mocked(fetchFulfillment).mockResolvedValue({ collected: false, partial: false } as never)
  vi.mocked(setFulfillment).mockResolvedValue({ localOnly: false } as never)
})
afterEach(async () => {
  client.close()
  await rm(directory, { recursive: true, force: true })
})

describe('shared device handover persistence', () => {
  it('shares collection between the dossier and every linked document, keeping standalone documents separate', async () => {
    await updateHandover(event, target, true, await testDossierContext(db, target), db)
    expect((await getHandover(event, { kind: 'ticket', id: 1 }, db)).collected).toBe(true)
    expect((await getHandover(event, { kind: 'document', id: 2 }, db)).collected).toBe(true)
    expect((await getHandover(event, { kind: 'document', id: 3 }, db)).collected).toBe(false)
    const ticket = { kind: 'ticket' as const, id: 1 }
    await updateHandover(event, ticket, false, await testDossierContext(db, ticket), db)
    expect((await getHandover(event, target, db)).collected).toBe(false)
    expect(setFulfillment).not.toHaveBeenCalled()
  })
  it('finds Shopify through another document on the same dossier', async () => {
    await link(2)
    expect((await resolveHandover(db, target)).shopify?.orderId).toBe('gid://shopify/Order/1')
    await updateHandover(event, target, true, await testDossierContext(db, target), db)
    expect(setFulfillment).toHaveBeenCalledWith(config, 'gid://shopify/Order/1', true)
    expect(await collected()).toBe(1)
  })
  it('uses current Shopify state on reads instead of a stale local checkbox', async () => {
    await link()
    await updateHandover(event, target, true, await testDossierContext(db, target), db)
    expect((await getHandover(event, target, db)).collected).toBe(false)
  })
  it('does not confirm a failed remote change and allows a subsequent retry', async () => {
    await link()
    vi.mocked(setFulfillment).mockRejectedValueOnce(new Error('Shopify refused'))
    await expect(updateHandover(event, target, true, await testDossierContext(db, target), db)).rejects.toThrow('Shopify refused')
    expect(await collected()).toBe(0)
    expect((await client.execute('SELECT operation_id FROM dossier_handovers')).rows[0]!.operation_id).toBeNull()
    await updateHandover(event, target, true, await testDossierContext(db, target), db)
    expect(await collected()).toBe(1)
  })
  it('retains the collected state when Shopify refuses cancellation', async () => {
    await link()
    await updateHandover(event, target, true, await testDossierContext(db, target), db)
    vi.mocked(setFulfillment).mockRejectedValueOnce(new Error('Cannot cancel'))
    await expect(updateHandover(event, target, false, await testDossierContext(db, target), db)).rejects.toThrow('Cannot cancel')
    expect(await collected()).toBe(1)
  })
  it('rejects missing and stale dossier proofs before any external write', async () => {
    await link()
    const context = await testDossierContext(db, target)
    await expect(updateHandover(event, target, true, { ...context, proofs: [] }, db)).rejects.toMatchObject({ statusCode: 428 })
    context.proofs[0]!.revision++
    await expect(updateHandover(event, target, true, context, db)).rejects.toMatchObject({ statusCode: 409 })
    expect(setFulfillment).not.toHaveBeenCalled()
  })
  it('prevents overlapping fulfillment writes across dossier/document entry points', async () => {
    await link()
    let release!: () => void
    let started!: () => void
    const waiting = new Promise<void>((resolve) => {
      started = resolve
    })
    vi.mocked(setFulfillment).mockImplementationOnce(async () => {
      started()
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { localOnly: false } as never
    })
    const first = updateHandover(event, target, true, await testDossierContext(db, target), db)
    await waiting
    const other = { kind: 'ticket' as const, id: 1 }
    const context = await testDossierContext(db, other)
    const revision = vi.fn()
    context.onRevision = revision
    await expect(updateHandover(event, other, false, context, db)).rejects.toMatchObject({ data: { code: 'HANDOVER_BUSY' } })
    expect(revision).not.toHaveBeenCalled()
    expect(setFulfillment).toHaveBeenCalledTimes(1)
    release()
    await first
  })
  it('refuses ambiguous links and another connected shop', async () => {
    await link(1)
    await link(2, 2)
    await expect(updateHandover(event, target, true, await testDossierContext(db, target), db)).rejects.toMatchObject({ data: { code: 'HANDOVER_AMBIGUOUS_ORDER' } })
    await client.execute('DELETE FROM document_imports WHERE document_id = 2')
    vi.mocked(connectShopify).mockResolvedValue({ config: { ...config, domain: 'wrong.myshopify.com' }, name: 'Wrong', allOrders: false })
    await expect(updateHandover(event, target, true, await testDossierContext(db, target), db)).rejects.toMatchObject({ data: { code: 'SHOPIFY_SHOP_MISMATCH' } })
    expect(setFulfillment).not.toHaveBeenCalled()
  })
})

describe('local pickup persistence', () => {
  it('persists local collection across reads and shares it with linked dossier documents', async () => {
    await link(2)
    vi.mocked(setFulfillment).mockResolvedValue({ localOnly: true } as never)
    expect(await updateHandover(event, target, true, await testDossierContext(db, target), db)).toMatchObject({ collected: true, localOnly: true })
    for (const scope of [target, { kind: 'ticket' as const, id: 1 }, { kind: 'document' as const, id: 2 }]) {
      expect(await getHandover(event, scope, db)).toMatchObject({ collected: true, localOnly: true, partial: false })
    }
    expect(await getHandover(event, { kind: 'document', id: 3 }, db)).toMatchObject({ collected: false, localOnly: false })
    await updateHandover(event, target, false, await testDossierContext(db, target), db)
    expect(await getHandover(event, target, db)).toMatchObject({ collected: false, localOnly: true })
    expect(await collected()).toBe(0)
  })
  it('recognizes a later Shopify completion and resumes remote cancellation', async () => {
    await link()
    vi.mocked(setFulfillment).mockResolvedValueOnce({ localOnly: true } as never)
    await updateHandover(event, target, true, await testDossierContext(db, target), db)
    vi.mocked(fetchFulfillment).mockResolvedValueOnce({ collected: true, partial: false } as never)
    expect(await getHandover(event, target, db)).toMatchObject({ collected: true, localOnly: false })
    await updateHandover(event, target, false, await testDossierContext(db, target), db)
    expect(setFulfillment).toHaveBeenLastCalledWith(config, 'gid://shopify/Order/1', false)
    expect(await getHandover(event, target, db)).toMatchObject({ collected: false, localOnly: false })
  })
  it('preserves local collection on a later remote failure', async () => {
    await link()
    vi.mocked(setFulfillment).mockResolvedValueOnce({ localOnly: true } as never)
    await updateHandover(event, target, true, await testDossierContext(db, target), db)
    vi.mocked(setFulfillment).mockRejectedValueOnce(new Error('Shopify unavailable'))
    await expect(updateHandover(event, target, false, await testDossierContext(db, target), db)).rejects.toThrow('Shopify unavailable')
    expect(await getHandover(event, target, db)).toMatchObject({ collected: true, localOnly: true, pending: false })
  })
})
