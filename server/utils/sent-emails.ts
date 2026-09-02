import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm'
import { createError } from 'h3'
import { z } from 'zod'
import { sentEmails } from '~~/server/db/schema'
import type { SentMailDetail, SentMailListResponse, SentMailSummary } from '~~/shared/types/pos'
import { useDb, type PosDatabase } from './turso'
import { effectiveMailStatus, type SentEmailRecord } from './email/journal'

type ListSentEmailsOptions = { limit: number, after?: string, before?: string }

function preview(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 140)
}

function summary(record: SentEmailRecord): SentMailSummary {
  return {
    id: record.id, from: record.from, to: record.to, replyTo: record.replyTo,
    subject: record.subject, createdAt: record.createdAt,
    lastEvent: effectiveMailStatus(record), preview: preview(record.bodyText)
  }
}

function cursor(record: SentEmailRecord) {
  return btoa(record.createdAt + '|' + record.id)
}

function parseCursor(value: string) {
  try {
    const parts = atob(value).split('|')
    return z.tuple([z.iso.datetime(), z.uuid()]).parse(parts)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Le curseur de pagination des e-mails est invalide.' })
  }
}

export async function listSentEmails(options: ListSentEmailsOptions, database: PosDatabase = useDb()): Promise<SentMailListResponse> {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100 || (options.after && options.before)) {
    throw createError({ statusCode: 400, statusMessage: 'Pagination des e-mails invalide.' })
  }
  const token = options.after || options.before
  const [date, id] = token ? parseCursor(token) : []
  const compare = options.before ? gt : lt
  const order = options.before ? asc : desc
  const records = await database.select().from(sentEmails).where(date && id
    ? or(compare(sentEmails.createdAt, date), and(eq(sentEmails.createdAt, date), compare(sentEmails.id, id)))
    : undefined
  ).orderBy(order(sentEmails.createdAt), order(sentEmails.id)).limit(options.limit + 1)
  const hasMore = records.length > options.limit
  const page = records.slice(0, options.limit)
  if (options.before) page.reverse()
  return {
    items: page.map(summary), hasMore, limit: options.limit,
    beforeCursor: page[0] ? cursor(page[0]) : null,
    afterCursor: page.at(-1) ? cursor(page.at(-1)!) : null
  }
}

export async function getSentEmail(id: string, database: PosDatabase = useDb()): Promise<SentMailDetail> {
  const [record] = await database.select().from(sentEmails).where(eq(sentEmails.id, id)).limit(1)
  if (!record) throw createError({ statusCode: 404, statusMessage: 'E-mail introuvable.' })
  return {
    ...summary(record), cc: [], bcc: [], bodyText: record.bodyText,
    errorMessage: effectiveMailStatus(record) === 'unknown'
      ? 'Résultat d’envoi à vérifier. Ne renvoyez pas ce message avant vérification.'
      : record.errorMessage
  }
}
