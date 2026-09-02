import { and, asc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { sentEmails, sentEmailEvents } from '~~/server/db/schema'
import { emailSendingStaleMs } from '~~/shared/constants/email'
import type { SentMailSendResult, SentMailStatus } from '~~/shared/types/pos'
import type { PosDatabase, PosDatabaseExecutor } from '../turso'
import { fingerprintIdempotencyPayload } from '../idempotency'
import { classifyEmailError, prepareEmail, parseMailAddress, type EmailBinding, type OutgoingMail } from './transport'

export type SentEmailRecord = typeof sentEmails.$inferSelect
export const terminalMailStatuses = new Set<SentMailStatus>(['delivered', 'bounced', 'rejected', 'failed'])

export function effectiveMailStatus(record: Pick<SentEmailRecord, 'status' | 'createdAt'>, now = Date.now()): SentMailStatus {
  return record.status === 'sending' && now - Date.parse(record.createdAt) > emailSendingStaleMs ? 'unknown' : record.status
}

function sendResult(record: SentEmailRecord, replayed: boolean): SentMailSendResult {
  const status = effectiveMailStatus(record)
  return {
    ok: ['sent', 'delivered', 'delivery_delayed'].includes(status),
    id: record.id, status, replayed,
    errorMessage: status === 'unknown'
      ? 'Résultat d’envoi à vérifier. Aucun nouvel envoi automatique ne sera effectué.'
      : record.errorMessage
  }
}

export async function applyStoredEmailEvents(tx: PosDatabaseExecutor, record: SentEmailRecord) {
  if (!record.providerMessageId) return record
  const from = parseMailAddress(record.from)
  const events = await tx.select().from(sentEmailEvents).where(and(
    eq(sentEmailEvents.providerMessageId, record.providerMessageId),
    eq(sentEmailEvents.recipient, record.to[0]!),
    eq(sentEmailEvents.sender, typeof from === 'string' ? from : from.email)
  )).orderBy(asc(sentEmailEvents.occurredAt), asc(sentEmailEvents.id))
  let next = record
  for (const event of events) {
    if (terminalMailStatuses.has(next.status) || (next.lastEventAt && event.occurredAt < next.lastEventAt)) continue
    next = {
      ...next, status: event.status, lastEventAt: event.occurredAt,
      errorCode: ['failed', 'rejected', 'bounced'].includes(event.status) ? `DELIVERY_${event.status.toUpperCase()}` : null,
      errorMessage: deliveryErrors[event.status] || null
    }
  }
  if (next !== record) {
    await tx.update(sentEmails).set({
      status: next.status, lastEventAt: next.lastEventAt,
      errorCode: next.errorCode, errorMessage: next.errorMessage, updatedAt: new Date().toISOString()
    }).where(eq(sentEmails.id, record.id))
  }
  return next
}

const deliveryErrors: Partial<Record<SentMailStatus, string>> = {
  bounced: 'Le message a été rejeté par le serveur destinataire.',
  failed: 'La livraison du message a échoué.',
  rejected: 'Cloudflare a refusé la livraison du message.'
}

type EmailAttemptIdentity = { actorId: number, documentId?: number, to: string, subject: string, text: string }

function replayAttempt(record: SentEmailRecord, fingerprint: string): SentMailSendResult {
  if (record.fingerprint !== fingerprint) {
    throw createError({ statusCode: 409, statusMessage: 'Cette tentative d’envoi concerne un autre message.', data: { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' } })
  }
  return sendResult(record, true)
}

export async function getEmailAttempt(database: PosDatabase, idempotencyKey: string, identity: EmailAttemptIdentity) {
  const [record] = await database.select().from(sentEmails).where(eq(sentEmails.idempotencyKey, idempotencyKey)).limit(1)
  return record ? replayAttempt(record, await fingerprintIdempotencyPayload(identity)) : null
}

export async function sendJournaledEmail(options: {
  database: PosDatabase
  binding: EmailBinding
  mail: OutgoingMail
  actorId: number
  documentId?: number
  idempotencyKey: string
}) {
  const { database, binding, mail } = options
  // Exclude regenerated PDF metadata: retries replay the original attempt,
  // even if a document was edited after the first send.
  const fingerprint = await fingerprintIdempotencyPayload({
    actorId: options.actorId, documentId: options.documentId,
    to: mail.to, subject: mail.subject, text: mail.text
  })
  const [existing] = await database.select().from(sentEmails).where(eq(sentEmails.idempotencyKey, options.idempotencyKey)).limit(1)
  if (existing) return replayAttempt(existing, fingerprint)
  const payload = prepareEmail(mail)
  const now = new Date().toISOString()
  const [reserved] = await database.insert(sentEmails).values({
    id: crypto.randomUUID(), documentId: options.documentId ?? null, actorId: options.actorId,
    idempotencyKey: options.idempotencyKey, fingerprint,
    from: mail.from, to: [mail.to], replyTo: mail.replyTo ? [mail.replyTo] : [],
    subject: mail.subject, bodyText: mail.text,
    attachments: mail.attachments.map(a => ({ filename: a.filename, type: a.type, size: a.content.byteLength })),
    status: 'sending', createdAt: now, updatedAt: now
  }).onConflictDoNothing({ target: sentEmails.idempotencyKey }).returning()
  if (!reserved) {
    const [winner] = await database.select().from(sentEmails).where(eq(sentEmails.idempotencyKey, options.idempotencyKey)).limit(1)
    if (!winner) throw createError({ statusCode: 503, statusMessage: 'Le journal d’envoi est indisponible.' })
    return replayAttempt(winner, fingerprint)
  }

  let providerMessageId: string
  try {
    const result = await binding.send(payload)
    if (!result?.messageId) throw new Error('Missing provider message ID')
    providerMessageId = result.messageId
  } catch (error) {
    const failure = classifyEmailError(error)
    const record = { ...reserved, status: failure.status, errorCode: failure.code, errorMessage: failure.message }
    try {
      await database.update(sentEmails).set({ status: record.status, errorCode: record.errorCode, errorMessage: record.errorMessage, updatedAt: new Date().toISOString() }).where(eq(sentEmails.id, reserved.id))
    } catch {
      console.error(JSON.stringify({ scope: 'email', code: 'JOURNAL_UPDATE_FAILED', id: reserved.id }))
      return sendResult({ ...reserved, status: 'unknown' }, false)
    }
    return sendResult(record, false)
  }

  try {
    // Sending already happened, outside the transaction. Reconcile early events
    // under the same write lock as the provider ID update.
    const record = await database.transaction(async (tx) => {
      const [accepted] = await tx.update(sentEmails).set({
        providerMessageId, status: 'sent', updatedAt: new Date().toISOString()
      }).where(eq(sentEmails.id, reserved.id)).returning()
      return applyStoredEmailEvents(tx, accepted!)
    })
    return sendResult(record, false)
  } catch {
    // Log correlation IDs only, never bodies, PDF data or credentials.
    console.error(JSON.stringify({ scope: 'email', code: 'ACCEPTED_JOURNAL_UPDATE_FAILED', id: reserved.id, providerMessageId }))
    return sendResult({ ...reserved, status: 'unknown' }, false)
  }
}
