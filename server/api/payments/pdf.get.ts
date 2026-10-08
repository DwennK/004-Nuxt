import { requireCapability } from '~~/server/utils/auth/session'
import { getCompanySettings } from '~~/server/utils/company-settings'
import { generatePaymentsPdf } from '~~/server/utils/documents/payments-pdf'
import { listPaymentsForExport } from '~~/server/utils/pos/payments'
import { paymentListQuerySchema } from '~~/shared/validation/pos'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const query = await getValidatedQuery(event, paymentListQuerySchema.parse)
  const [payments, company] = await Promise.all([
    listPaymentsForExport(query),
    getCompanySettings()
  ])
  const pdf = await generatePaymentsPdf(payments, company, query)
  const filename = `paiements-${query.dateFrom || 'debut'}-${query.dateTo || 'fin'}.pdf`
  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return pdf
})
