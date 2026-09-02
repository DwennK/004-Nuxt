import { documentEmailSchema } from '~~/shared/validation/pos'
import { supportsDocumentPrintProfile } from '~~/shared/utils/print'
import { getCompanySettings } from '~~/server/utils/company-settings'
import { generateDocumentPdf } from '~~/server/utils/documents/pdf'
import { sendDocumentEmail } from '~~/server/utils/documents/email'
import { getDocumentById } from '~~/server/utils/pos/documents'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'
import { requireIdempotencyKey } from '~~/server/utils/idempotency'
import { getEmailAttempt } from '~~/server/utils/email/journal'
import { useDb } from '~~/server/utils/turso'

export default eventHandler(async (event) => {
  const auth = await requireCapability(event, 'financial:record')
  const idempotencyKey = requireIdempotencyKey(event)
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const input = await readValidatedBody(event, documentEmailSchema.parse)
  // A replay only reads the original attempt, even if the document or current
  // provider configuration has since changed. Authorization still runs first.
  const previous = await getEmailAttempt(useDb(), idempotencyKey, {
    actorId: auth.user.id, documentId: params.id,
    to: input.to, subject: input.subject, text: input.message
  })
  if (previous) return previous
  const [document, company] = await Promise.all([
    getDocumentById(params.id),
    getCompanySettings()
  ])

  if (!supportsDocumentPrintProfile(document.type, 'a4')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ce document ne peut pas être envoyé en PDF'
    })
  }

  const pdfBytes = await generateDocumentPdf(document, company)
  const result = await sendDocumentEmail({
    event,
    actorId: auth.user.id,
    idempotencyKey,
    input,
    document,
    company,
    pdfBytes
  })

  return result
})
