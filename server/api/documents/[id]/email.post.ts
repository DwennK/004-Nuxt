import { z } from 'zod'
import { documentEmailSchema } from '~~/shared/validation/pos'
import { supportsDocumentPrintProfile } from '~~/shared/utils/print'
import { getCompanySettings } from '~~/server/utils/company-settings'
import { generateDocumentPdf } from '~~/server/utils/documents/pdf'
import { sendDocumentEmail } from '~~/server/utils/documents/email'
import { getDocumentById } from '~~/server/utils/pos/documents'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
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
