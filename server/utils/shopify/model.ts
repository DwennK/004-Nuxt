import { createError } from 'h3'
import { z } from 'zod'
import { calculateCommercialTotals } from '~~/shared/domain/commercial/money'

const money = z.object({ shopMoney: z.object({ amount: z.string(), currencyCode: z.string() }) })
const tax = z.object({ rate: z.number().nonnegative(), priceSet: money })
const address = z.object({
  firstName: z.string().nullable(), lastName: z.string().nullable(), company: z.string().nullable(),
  address1: z.string().nullable(), address2: z.string().nullable(), zip: z.string().nullable(),
  city: z.string().nullable(), phone: z.string().nullable()
})
export const shopifyOrderSchema = z.object({
  id: z.string(), name: z.string(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  cancelledAt: z.string().nullable(), test: z.boolean(), taxesIncluded: z.boolean(),
  currencyCode: z.string(), presentmentCurrencyCode: z.string(), note: z.string().nullable(),
  email: z.string().nullable(), phone: z.string().nullable(),
  billingAddress: address.nullable(), shippingAddress: address.nullable(),
  displayFinancialStatus: z.string().nullable(), displayFulfillmentStatus: z.string(),
  currentTotalPriceSet: money, currentTotalTaxSet: money, totalReceivedSet: money,
  totalOutstandingSet: money, totalRefundedSet: money,
  currentTotalDutiesSet: money.nullable(), currentTotalAdditionalFeesSet: money.nullable(), totalTipReceivedSet: money,
  lineItems: z.array(z.object({
    id: z.string(), name: z.string(), sku: z.string().nullable(), quantity: z.number().int().positive(),
    currentQuantity: z.number().int().nonnegative(), isGiftCard: z.boolean(),
    customAttributes: z.array(z.object({ key: z.string(), value: z.string() })),
    originalTotalSet: money,
    discountAllocations: z.array(z.object({ allocatedAmountSet: money })), taxLines: z.array(tax)
  })),
  shippingLines: z.array(z.object({ id: z.string(), title: z.string(), isRemoved: z.boolean(), discountedPriceSet: money, taxLines: z.array(tax) })),
  transactions: z.array(z.object({
    id: z.string(), kind: z.string(), status: z.string(), test: z.boolean(),
    gateway: z.string().nullable(), formattedGateway: z.string().nullable(),
    createdAt: z.string().datetime(), processedAt: z.string().datetime().nullable(), amountSet: money
  })),
  transactionsCount: z.object({ count: z.number().int(), precision: z.string() })
})

export type ShopifyOrder = z.infer<typeof shopifyOrderSchema>
export type ShopifyLine = { label: string, quantity: number, unitPrice: number, vatRate: number }

export function shopifyError(message: string, code = 'SHOPIFY_UNSUPPORTED_ORDER', statusCode = 422): never {
  throw createError({ statusCode, statusMessage: message, data: { code } })
}

export function moneyToCents(amount: string) {
  // Decimal strings only: never silently accept NaN, exponent notation or a missing amount.
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount)
  if (!match || /[1-9]/.test((match[3] || '').slice(2))) {
    return shopifyError('Un montant Shopify ne peut pas être représenté en centimes.')
  }
  const value = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0').slice(0, 2))
  if (!Number.isSafeInteger(value)) return shopifyError('Montant Shopify hors limites.')
  return match[1] ? -value : value
}

function cents(value: z.infer<typeof money>) {
  if (value.shopMoney.currencyCode !== 'CHF') return shopifyError('Seules les commandes et transactions en CHF sont prises en charge.')
  return moneyToCents(value.shopMoney.amount)
}

function makeLines(label: string, quantity: number, total: number, taxes: z.infer<typeof tax>[]): ShopifyLine[] {
  if (!Number.isSafeInteger(total) || total < 0) return shopifyError('Le montant d’une ligne Shopify est invalide.')
  const taxTotal = taxes.reduce((sum, item) => sum + cents(item.priceSet), 0)
  if (taxTotal < 0 || taxTotal > total) return shopifyError('La TVA Shopify est incohérente.')
  const vatRate = taxTotal === 0 ? 0 : Number((taxes.reduce((sum, item) => sum + item.rate, 0) * 100).toFixed(6))
  const unitPrice = Math.floor(total / quantity)
  const remainder = total - unitPrice * quantity
  const lines: ShopifyLine[] = []
  if (quantity - remainder > 0) lines.push({ label, quantity: quantity - remainder, unitPrice, vatRate })
  if (remainder > 0) lines.push({ label, quantity: remainder, unitPrice: unitPrice + 1, vatRate })
  if (calculateCommercialTotals(lines).taxAmount !== taxTotal) {
    return shopifyError(`La TVA de « ${label} » ne se réconcilie pas exactement avec le POS.`)
  }
  return lines
}

export function normalizeShopifyOrder(order: ShopifyOrder) {
  if (order.test || order.cancelledAt) return shopifyError('Les commandes de test ou annulées ne peuvent pas être importées.')
  if (order.currencyCode !== 'CHF' || order.presentmentCurrencyCode !== 'CHF') return shopifyError('Seules les commandes en CHF sont prises en charge.')
  if (cents(order.totalRefundedSet) !== 0 || /REFUNDED/.test(order.displayFinancialStatus || '') || order.transactions.some(t => t.kind === 'REFUND' && t.status === 'SUCCESS')) {
    return shopifyError('Cette commande comporte un remboursement. Un rapprochement manuel est nécessaire.')
  }
  if ([order.currentTotalDutiesSet, order.currentTotalAdditionalFeesSet, order.totalTipReceivedSet].some(value => value && cents(value) !== 0)) {
    return shopifyError('Les droits de douane, frais supplémentaires et pourboires nécessitent un traitement manuel.')
  }
  if (order.transactionsCount.precision !== 'EXACT' || order.transactionsCount.count !== order.transactions.length) {
    return shopifyError('La liste des transactions Shopify est incomplète.')
  }
  if (!order.lineItems.length) return shopifyError('Cette commande ne contient aucun article.')
  const lines = order.lineItems.flatMap((line) => {
    if (line.isGiftCard || line.quantity !== line.currentQuantity) return shopifyError('Les cartes cadeaux et articles retirés ou remboursés nécessitent un traitement manuel.')
    const discount = line.discountAllocations.reduce((sum, item) => sum + cents(item.allocatedAmountSet), 0)
    const taxTotal = line.taxLines.reduce((sum, item) => sum + cents(item.priceSet), 0)
    const total = cents(line.originalTotalSet) - discount + (order.taxesIncluded ? 0 : taxTotal)
    const attributes = line.customAttributes.filter(a => !a.key.startsWith('_')).map(a => `${a.key}: ${a.value}`)
    const label = [line.name, line.sku ? `SKU ${line.sku}` : null, ...attributes].filter(Boolean).join(' · ')
    return makeLines(label, line.quantity, total, line.taxLines)
  })
  for (const shipping of order.shippingLines) {
    if (shipping.isRemoved) continue
    const taxTotal = shipping.taxLines.reduce((sum, item) => sum + cents(item.priceSet), 0)
    lines.push(...makeLines(`Livraison · ${shipping.title}`, 1, cents(shipping.discountedPriceSet) + (order.taxesIncluded ? 0 : taxTotal), shipping.taxLines))
  }
  lines.push({ label: `Commande Shopify ${order.name}`, quantity: 1, unitPrice: 0, vatRate: 0 })
  const totals = calculateCommercialTotals(lines)
  if (totals.total !== cents(order.currentTotalPriceSet) || totals.taxAmount !== cents(order.currentTotalTaxSet)) {
    return shopifyError('Le total TTC ou la TVA Shopify ne correspond pas aux lignes importées. Aucun document n’a été créé.')
  }
  const payments = order.transactions.filter(t => t.status === 'SUCCESS' && (t.kind === 'SALE' || t.kind === 'CAPTURE')).map((t) => {
    if (t.test || !t.gateway || /gift[ _-]?card|store[ _-]?credit/i.test(t.gateway)) return shopifyError('Ce mode de règlement Shopify nécessite un rapprochement manuel.')
    const amount = cents(t.amountSet)
    if (amount < 0) return shopifyError('Un paiement Shopify est négatif.')
    return { transactionId: t.id, amount, paidAt: t.processedAt || t.createdAt, gateway: t.formattedGateway || t.gateway }
  }).filter(t => t.amount > 0)
  const received = payments.reduce((sum, p) => sum + p.amount, 0)
  if (new Set(payments.map(p => p.transactionId)).size !== payments.length || received !== cents(order.totalReceivedSet) || received > totals.total || totals.total - received !== cents(order.totalOutstandingSet)) {
    return shopifyError('Les encaissements Shopify ne se réconcilient pas avec le solde de la commande.')
  }
  return { lines, totals, payments }
}
