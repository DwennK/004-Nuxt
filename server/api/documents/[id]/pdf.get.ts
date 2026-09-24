import { numericIdParamsSchema } from '~~/shared/validation/api'
import { getDocumentPdfFilename } from '~~/shared/utils/document-email'
import { requireCapability } from '~~/server/utils/auth/session'
import { getCompanySettings } from '~~/server/utils/company-settings'
import { generateDocumentPdf } from '~~/server/utils/documents/pdf'
import { readDossierRecord } from '~~/server/utils/pos/dossiers'
import { getDocumentById } from '~~/server/utils/pos/documents'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const { id } = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const [document, company] = await Promise.all([
    readDossierRecord({ kind: 'document', id }, () => getDocumentById(id)),
    getCompanySettings()
  ])
  const pdf = await generateDocumentPdf(document, company, getRequestURL(event).origin)
  const disposition = getQuery(event).inline === '1' ? 'inline' : 'attachment'
  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(getDocumentPdfFilename(document))}`)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return pdf
})
