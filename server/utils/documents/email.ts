import type { H3Event } from 'h3'
import type { DocumentEmailInput, DocumentDetail } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { getDocumentPdfFilename } from '~~/shared/utils/document-email'
import { useDb } from '../turso'
import { getEmailBinding } from '../email/transport'
import { sendJournaledEmail } from '../email/journal'

export async function sendDocumentEmail(options: {
  event: H3Event
  input: DocumentEmailInput
  document: DocumentDetail
  company: CompanySettingsRecord
  pdfBytes: Uint8Array
  actorId: number
  idempotencyKey: string
}) {
  const config = useRuntimeConfig()
  return sendJournaledEmail({
    database: useDb(), binding: getEmailBinding(options.event),
    actorId: options.actorId, documentId: options.document.id, idempotencyKey: options.idempotencyKey,
    mail: {
      from: config.mailFrom || '', to: options.input.to,
      replyTo: config.mailReplyTo || options.company.email || undefined,
      subject: options.input.subject, text: options.input.message,
      attachments: [{ filename: getDocumentPdfFilename(options.document), type: 'application/pdf', content: options.pdfBytes }]
    }
  })
}
