import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { documents } from '~~/server/db/schema'
import { savDetailsSchema } from '~~/shared/validation/sav'
import type { SavDetails } from '~~/shared/types/sav'
import type { PosDatabaseExecutor } from '../turso'
import { useDb } from '../turso'
import { guardDossierWrite, type DossierWriteContext } from './dossiers'
import { createTicketEvent } from './ticket-events'
import { savStatusLabels } from '~~/shared/types/sav'

export async function validateSavWrite(tx: PosDatabaseExecutor, input: {
  type: string
  ticketId?: number | null
  customerId: number
  savId?: number | null
  sav?: SavDetails | null
  lines: unknown[]
  status?: string
}, existing?: typeof documents.$inferSelect) {
  if (existing && (existing.type === 'sav' || input.type === 'sav' || existing.savId || input.savId)) {
    if (existing.type !== input.type || existing.ticketId !== input.ticketId || existing.customerId !== input.customerId
      || (existing.savId ?? null) !== (input.savId ?? null)) {
      throw createError({ statusCode: 409, statusMessage: 'Le SAV et ses documents doivent conserver leur type, leur dossier et leur client.' })
    }
  }
  if (input.type === 'sav') {
    if (!input.ticketId || input.savId || input.lines.length || !['issued', undefined].includes(input.status)) {
      throw createError({ statusCode: 400, statusMessage: 'Un SAV doit être lié à un dossier et ne contient aucune ligne financière.' })
    }
    const parsed = savDetailsSchema.safeParse(input.sav)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Les informations du SAV sont incomplètes.', data: parsed.error.flatten() })
    const sav = parsed.data
    if (!existing && sav.status !== 'received') throw createError({ statusCode: 400, statusMessage: 'Un nouveau SAV commence à la réception.' })
    if (sav.status === 'delivered' && (sav.coverage === 'pending' || !sav.work)) {
      throw createError({ statusCode: 400, statusMessage: 'Renseignez la prise en charge et les travaux avant la remise au client.' })
    }
    if (sav.sourceDocumentId) {
      const [source] = await tx.select().from(documents).where(and(eq(documents.id, sav.sourceDocumentId), eq(documents.ticketId, input.ticketId), eq(documents.customerId, input.customerId))).limit(1)
      if (!source || source.type === 'sav') throw createError({ statusCode: 400, statusMessage: 'La référence doit être un document commercial de ce dossier.' })
    }
    if (existing) {
      const linked = await tx.select({ id: documents.id }).from(documents).where(eq(documents.savId, existing.id)).limit(1)
      if (linked.length && (sav.coverage !== 'billable' || sav.status === 'cancelled')) {
        throw createError({ statusCode: 409, statusMessage: 'Ce SAV possède des documents commerciaux : conservez sa prise en charge payante et son historique.' })
      }
    }
    return { ...sav, deliveredAt: sav.status === 'delivered' ? existing?.sav?.deliveredAt || new Date().toISOString() : null }
  }
  if (input.sav) throw createError({ statusCode: 400, statusMessage: 'Les informations SAV sont réservées aux SAV.' })
  if (!input.lines.length) throw createError({ statusCode: 400, statusMessage: 'Au moins une ligne est obligatoire.' })
  if (input.savId) {
    if (!input.ticketId) throw createError({ statusCode: 400, statusMessage: 'Le dossier du SAV est obligatoire.' })
    const [sav] = await tx.select().from(documents).where(eq(documents.id, input.savId)).limit(1)
    if (!sav || sav.type !== 'sav' || sav.ticketId !== input.ticketId || sav.customerId !== input.customerId
      || sav.sav?.coverage !== 'billable' || sav.sav.status === 'cancelled') {
      throw createError({ statusCode: 409, statusMessage: 'Sélectionnez un SAV payant de ce dossier.' })
    }
  }
  return null
}

export async function updateSavRecord(id: number, input: SavDetails, context?: DossierWriteContext) {
  await useDb().transaction(async (tx) => {
    await guardDossierWrite(tx, [{ kind: 'document', id }], context)
    const [document] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1)
    if (!document || document.type !== 'sav') throw createError({ statusCode: 404, statusMessage: 'SAV introuvable' })
    const sav = await validateSavWrite(tx, { ...document, sav: input, lines: [] }, document)
    await tx.update(documents).set({ sav, updatedAt: new Date().toISOString() }).where(eq(documents.id, id))
    await createTicketEvent({
      ticketId: document.ticketId!, kind: 'ticket_note_added',
      label: `SAV ${document.documentNumber} · ${savStatusLabels[input.status]}`,
      metadata: { documentId: id, savStatus: input.status, coverage: input.coverage }
    }, tx)
  })
}
