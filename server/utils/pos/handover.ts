import { and, eq, inArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { documentImports, documents, dossierHandovers } from '~~/server/db/schema'
import type { DossierSnapshot, DossierTarget } from '~~/shared/types/dossier'
import type { HandoverState } from '~~/shared/types/handover'
import { getShopifyProvenance } from '../shopify/import'
import { connectShopify } from '../shopify/client'
import { fetchFulfillment, fulfillmentState, setFulfillment } from '../shopify/fulfillment'
import { shopifyError } from '../shopify/model'
import { useDb, type PosDatabase, type PosDatabaseExecutor } from '../turso'
import { guardDossierWrite, resolveDossierKey, type DossierWriteContext } from './dossiers'

export async function resolveHandover(db: PosDatabaseExecutor, target: DossierTarget) {
  const key = await resolveDossierKey(db, target)
  const ticketId = key.startsWith('ticket:') ? Number(key.slice(7)) : null
  const related = await db.select({ id: documents.id }).from(documents)
    .where(ticketId ? eq(documents.ticketId, ticketId) : eq(documents.id, target.id))
  const imported = related.length
    ? await db.select({ documentId: documentImports.documentId })
        .from(documentImports).where(and(eq(documentImports.source, 'shopify_order'), inArray(documentImports.documentId, related.map(item => item.id))))
    : []
  if (imported.length > 1) return shopifyError('Plusieurs commandes Shopify sont liées à ce dossier. Gérez leur livraison dans Shopify.', 'HANDOVER_AMBIGUOUS_ORDER', 409)
  const shopify = imported[0] ? await getShopifyProvenance(imported[0].documentId, db) : null
  return { key, shopify }
}

async function linkedConfig(event: H3Event, domain: string) {
  const { config } = await connectShopify(event)
  if (config.domain !== domain) return shopifyError('La boutique connectée ne correspond pas à cette commande.', 'SHOPIFY_SHOP_MISMATCH', 409)
  return config
}

export async function getHandover(event: H3Event, target: DossierTarget, db: PosDatabase = useDb()): Promise<HandoverState> {
  const { key, shopify } = await resolveHandover(db, target)
  const [row] = await db.select().from(dossierHandovers).where(eq(dossierHandovers.key, key))
  const state = shopify
    ? fulfillmentState(await fetchFulfillment(await linkedConfig(event, shopify.domain), shopify.orderId))
    : { collected: row?.collected ?? false, partial: false }
  // A local handover stays recorded even if Shopify later changes its available actions.
  // A subsequently completed Shopify order takes over as the authoritative state.
  const localOnly = !!shopify && !!row?.localOnly && !state.collected
  return { ...state, collected: localOnly ? row!.collected : state.collected, localOnly, pending: !!row?.operationId && row.operationExpiresAt > Date.now(), shopify }
}

export async function updateHandover(event: H3Event, target: DossierTarget, collected: boolean, context: DossierWriteContext, db: PosDatabase = useDb()): Promise<HandoverState> {
  const operationId = crypto.randomUUID()
  // Commit the lease check and persistent operation lock before any network write.
  // No network request is made inside a SQLite transaction.
  const revisions: DossierSnapshot[] = []
  const resolved = await db.transaction(async (tx) => {
    await guardDossierWrite(tx, [target], { ...context, onRevision: snapshot => revisions.push(snapshot) })
    const { key, shopify } = await resolveHandover(tx, target)
    const [existing] = await tx.select().from(dossierHandovers).where(eq(dossierHandovers.key, key))
    if (existing?.operationId && existing.operationExpiresAt > Date.now()) {
      return shopifyError('Une livraison est déjà en cours de synchronisation. Actualisez dans quelques instants.', 'HANDOVER_BUSY', 409)
    }
    const values = { key, updatedAt: new Date().toISOString(), updatedBy: context.userId, operationId, operationExpiresAt: Date.now() + 600_000 }
    await tx.insert(dossierHandovers).values(values).onConflictDoUpdate({ target: dossierHandovers.key, set: values })
    return { key, shopify }
  })
  for (const revision of revisions) context.onRevision?.(revision)
  try {
    let localOnly = false
    if (resolved.shopify) {
      const config = await linkedConfig(event, resolved.shopify.domain)
      const result = await setFulfillment(config, resolved.shopify.orderId, collected)
      localOnly = result.localOnly
    }
    const updated = await db.update(dossierHandovers).set({ collected, localOnly, operationId: null, operationExpiresAt: 0, updatedAt: new Date().toISOString() })
      .where(and(eq(dossierHandovers.key, resolved.key), eq(dossierHandovers.operationId, operationId))).returning({ key: dossierHandovers.key })
    if (!updated.length) return shopifyError('La synchronisation a expiré. Actualisez l’état.', 'HANDOVER_EXPIRED', 409)
    return { collected, partial: false, pending: false, localOnly, shopify: resolved.shopify }
  } catch (error) {
    // A remote success followed by a lost response is reconciled from Shopify on
    // the next read/retry. Never claim a rollback of a remote side effect.
    await db.update(dossierHandovers).set({ operationId: null, operationExpiresAt: 0 })
      .where(and(eq(dossierHandovers.key, resolved.key), eq(dossierHandovers.operationId, operationId)))
    throw error
  }
}
