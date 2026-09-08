import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import { createError, getHeader, setResponseHeader, type H3Event } from 'h3'
import { z } from 'zod'
import {
  documents,
  dossierPresences,
  dossierScopes,
  payments,
  tickets
} from '~~/server/db/schema'
import {
  DOSSIER_LEASE_MS,
  type DossierProof,
  type DossierSnapshot,
  type DossierStatus,
  type DossierTarget
} from '~~/shared/types/dossier'
import type {
  dossierSessionSchema
} from '~~/shared/validation/dossier'
import {
  dossierProofSchema
} from '~~/shared/validation/dossier'
import { getUseCaseContext, type RequestActor } from '../auth/session'
import {
  useDb,
  type PosDatabase,
  type PosDatabaseExecutor,
  type PosTransaction
} from '../turso'

export type DossierWriteContext = {
  userId: number
  tabId: string
  proofs: DossierProof[]
  onRevision?: (snapshot: DossierSnapshot) => void
}

function conflict(code: string, message: string, statusCode = 409): never {
  throw createError({ statusCode, message, data: { code } })
}

export function readDossierWriteContext(event: H3Event): DossierWriteContext {
  let proofs: DossierProof[] = []
  try {
    proofs = z
      .array(dossierProofSchema)
      .max(64)
      .parse(JSON.parse(getHeader(event, 'x-dossier-proofs') || '[]'))
  } catch {
    conflict(
      'DOSSIER_PROOF_INVALID',
      'Réservation invalide. Rechargez la fiche.',
      400
    )
  }
  const revisions: DossierSnapshot[] = []
  return {
    userId: getUseCaseContext(event).actor.userId,
    tabId: getHeader(event, 'x-dossier-tab') || '',
    proofs,
    onRevision(snapshot) {
      revisions.push(snapshot)
      setResponseHeader(event, 'X-Dossier-Revisions', JSON.stringify(revisions))
    }
  }
}

export async function resolveDossierKey(
  db: PosDatabaseExecutor,
  target: DossierTarget
): Promise<string> {
  if (target.kind === 'ticket') {
    const [row] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.id, target.id))
      .limit(1)
    if (!row) conflict('DOSSIER_NOT_FOUND', 'Dossier introuvable.', 404)
    return `ticket:${target.id}`
  }
  let documentId = target.id
  if (target.kind === 'payment') {
    const [row] = await db
      .select({ documentId: payments.documentId })
      .from(payments)
      .where(eq(payments.id, target.id))
      .limit(1)
    if (!row) conflict('DOSSIER_NOT_FOUND', 'Paiement introuvable.', 404)
    documentId = row.documentId
  }
  const [row] = await db
    .select({ ticketId: documents.ticketId })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)
  if (!row) conflict('DOSSIER_NOT_FOUND', 'Document introuvable.', 404)
  return row.ticketId ? `ticket:${row.ticketId}` : `document:${documentId}`
}

export async function getDossierSnapshot(
  db: PosDatabaseExecutor,
  target: DossierTarget
): Promise<DossierSnapshot> {
  const key = await resolveDossierKey(db, target)
  const [row] = await db
    .select({ revision: dossierScopes.revision })
    .from(dossierScopes)
    .where(eq(dossierScopes.key, key))
    .limit(1)
  return { key, revision: row?.revision ?? 0 }
}

// Bracket existing read models with a monotonic revision. Never tag old content
// with a newer revision, including when a document changes its parent ticket.
export async function readDossierRecord<T>(
  target: DossierTarget,
  read: () => Promise<T>
) {
  const db = useDb()
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await getDossierSnapshot(db, target)
    const value = await read()
    const after = await getDossierSnapshot(db, target)
    if (before.key === after.key && before.revision === after.revision)
      return { ...value, dossier: before }
  }
  conflict('DOSSIER_CHANGED', 'Le dossier évolue. Rechargez la fiche.')
}

// Must run inside the very same transaction as the business write. A lease
// acquired/renewed outside it is never sufficient authorization to mutate.
export async function guardDossierWrite(
  tx: PosTransaction,
  targets: DossierTarget[],
  context?: DossierWriteContext,
  extraKeys: string[] = []
) {
  if (!context?.proofs.length)
    conflict(
      'DOSSIER_PROOF_REQUIRED',
      'Ouvrez le dossier pour réserver sa modification.',
      428
    )
  const keys = [
    ...new Set([
      ...(await Promise.all(
        targets.map(target => resolveDossierKey(tx, target))
      )),
      ...extraKeys
    ])
  ].sort()
  for (const key of keys) {
    const proof = context.proofs.find(item => item.key === key)
    if (!proof)
      conflict(
        'DOSSIER_PROOF_REQUIRED',
        'Réservez aussi le dossier de destination.',
        428
      )
    const now = Date.now()
    const rows = await tx
      .update(dossierScopes)
      .set({ revision: sql`${dossierScopes.revision} + 1` })
      .where(
        and(
          eq(dossierScopes.key, key),
          eq(dossierScopes.token, proof.token),
          eq(dossierScopes.ownerTabId, context.tabId),
          eq(dossierScopes.ownerUserId, context.userId),
          eq(dossierScopes.revision, proof.revision),
          gt(dossierScopes.expiresAt, now)
        )
      )
      .returning({ key: dossierScopes.key, revision: dossierScopes.revision })
    if (!rows[0])
      conflict(
        'DOSSIER_CONFLICT',
        'La réservation a expiré, a été reprise ou le dossier a changé. Copiez vos saisies puis rechargez la fiche.'
      )
    context.onRevision?.(rows[0])
  }
}

export async function dossierSession(
  input: z.output<typeof dossierSessionSchema>,
  actor: Pick<RequestActor, 'userId' | 'name' | 'isAdmin'>,
  database: PosDatabase = useDb()
): Promise<DossierStatus> {
  if (
    input.action !== 'observe'
    && input.action !== 'release'
    && input.intent === 'edit'
    && input.target.kind !== 'ticket'
    && !actor.isAdmin
  ) {
    conflict(
      'DOSSIER_FORBIDDEN',
      'Modification réservée aux administrateurs.',
      403
    )
  }
  return database.transaction(async (tx) => {
    const now = Date.now()
    const resolvedKey = await resolveDossierKey(tx, input.target)
    if (
      input.standalone
      && (input.target.kind !== 'document' || !actor.isAdmin)
    )
      conflict(
        'DOSSIER_FORBIDDEN',
        'Rattachement réservé aux administrateurs.',
        403
      )
    const key = input.standalone ? `document:${input.target.id}` : resolvedKey
    await tx.insert(dossierScopes).values({ key }).onConflictDoNothing()
    const [scope] = await tx
      .select()
      .from(dossierScopes)
      .where(eq(dossierScopes.key, key))
      .limit(1)
    if (!scope) throw new Error('Dossier scope missing')
    const owns
      = scope.ownerUserId === actor.userId
        && scope.ownerTabId === input.tabId
        && scope.token === input.token
        && scope.expiresAt > now
    let revealToken = owns
    if (input.action === 'release') {
      if (owns)
        await tx
          .update(dossierScopes)
          .set({ token: null, expiresAt: 0 })
          .where(eq(dossierScopes.key, key))
      await tx
        .delete(dossierPresences)
        .where(eq(dossierPresences.id, `${key}:${actor.userId}:${input.tabId}`))
    } else {
      const presence = {
        scopeKey: key,
        tabId: input.tabId,
        userId: actor.userId,
        name: actor.name,
        station: input.station,
        dirty: input.dirty,
        expiresAt: now + DOSSIER_LEASE_MS
      }
      await tx
        .insert(dossierPresences)
        .values({ id: `${key}:${actor.userId}:${input.tabId}`, ...presence })
        .onConflictDoUpdate({ target: dossierPresences.id, set: presence })
      const takeover = input.action === 'takeover'
      if (takeover && input.expectedGeneration !== scope.generation)
        conflict(
          'DOSSIER_TAKEOVER_CHANGED',
          'La réservation a changé. Vérifiez le poste affiché avant de reprendre la main.'
        )
      const acquire = input.action === 'acquire' && scope.expiresAt <= now
      if (owns || takeover || acquire) {
        revealToken = true
        await tx
          .update(dossierScopes)
          .set({
            token: owns && !takeover ? scope.token : crypto.randomUUID(),
            generation:
              owns && !takeover ? scope.generation : scope.generation + 1,
            ownerTabId: input.tabId,
            ownerUserId: actor.userId,
            ownerName: actor.name,
            ownerStation: input.station,
            expiresAt: now + DOSSIER_LEASE_MS
          })
          .where(eq(dossierScopes.key, key))
      }
    }
    const expired = await tx
      .select({ id: dossierPresences.id })
      .from(dossierPresences)
      .where(lt(dossierPresences.expiresAt, now))
      .limit(50)
    if (expired.length)
      await tx.delete(dossierPresences).where(
        inArray(
          dossierPresences.id,
          expired.map(row => row.id)
        )
      )
    const [current] = await tx
      .select()
      .from(dossierScopes)
      .where(eq(dossierScopes.key, key))
      .limit(1)
    const presences = await tx
      .select()
      .from(dossierPresences)
      .where(
        and(
          eq(dossierPresences.scopeKey, key),
          gt(dossierPresences.expiresAt, now)
        )
      )
    const active = current!.expiresAt > now && !!current!.token
    const owner = active
      ? {
          tabId: current!.ownerTabId!,
          userId: current!.ownerUserId!,
          name: current!.ownerName!,
          station: current!.ownerStation!,
          dirty:
            presences.find(
              row =>
                row.tabId === current!.ownerTabId
                && row.userId === current!.ownerUserId
            )?.dirty ?? false
        }
      : null
    return {
      key,
      revision: current!.revision,
      generation: current!.generation,
      owner,
      expiresAt: active ? current!.expiresAt : 0,
      token:
        revealToken
        && active
        && current!.ownerTabId === input.tabId
        && current!.ownerUserId === actor.userId
          ? current!.token
          : null,
      peers: presences
        .filter(
          row => row.tabId !== input.tabId || row.userId !== actor.userId
        )
        .map(({ tabId, userId, name, station, dirty }) => ({
          tabId,
          userId,
          name,
          station,
          dirty
        }))
    }
  })
}
