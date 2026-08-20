import { documentEmailSchema } from '~~/shared/validation/pos'
import { supportsDocumentPrintProfile } from '~~/shared/utils/print'
import { getCompanySettings } from '~~/server/utils/company-settings'
import { generateDocumentPdf } from '~~/server/utils/documents/pdf'
import { sendDocumentEmail } from '~~/server/utils/documents/email'
import { getDocumentById } from '~~/server/utils/pos/documents'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:record')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const input = await readValidatedBody(event, documentEmailSchema.parse)
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
    input,
    document,
    company,
    pdfBytes
  })

  return {
    ok: true,
    id: result.id
  }
})
