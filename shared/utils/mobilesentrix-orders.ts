import type { MobileSentrixOrder, MobileSentrixOrderLine, MobileSentrixOrderLineKind } from '../types/mobilesentrix-orders'
import { supplierMatchesSearch } from './mobilesentrix-browser'

/** The supplier's device attribute set includes tablets, and is not a phone flag. */
export function mobileSentrixOrderLineKind(attributeSet: unknown, name: string): MobileSentrixOrderLineKind {
  if (attributeSet !== 10 && attributeSet !== '10') {
    return attributeSet === 20 || attributeSet === '20' ? 'other' : 'unknown'
  }
  const model = name.replace(/^Pre-Owned Device\s*-\s*/i, '').trim()
  if (/\b(?:ipad|tablet|tab|watch|buds|pad|accessor(?:y|ies)|cable|charger|case|screen|battery)\b/i.test(model)) return 'other'
  if (/^(?:iphone\s+(?:\d|se\b|x[rs]?\b)|(?:samsung\s+)?galaxy\s+(?:[samfj]\d|note\s*\d|z\s*(?:fold|flip)\s*\d)|oneplus\s+(?:\d|nord\b|open\b))/i.test(model)) return 'smartphone'
  return 'unknown'
}

/** Validate the supplier's calendar value without assuming a timezone. */
export function mobileSentrixCalendarDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(value.trim())
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}` || Number(year) < 1000) return null
  if (hour !== undefined && (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59)) return null
  return `${year}-${month}-${day}`
}

export function mobileSentrixOrderDate(value: string | null) {
  const date = mobileSentrixCalendarDate(value)
  return date ? `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}` : 'Non communiquée'
}

export function mobileSentrixOrderMoney(cents: number | null, currency: string | null) {
  if (cents === null) return 'Non communiqué'
  const amount = new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
  return `${amount} ${currency || '(devise non communiquée)'}`
}

export function mobileSentrixOrderStatus(status: string) {
  const labels: Record<string, string> = {
    'shipped': 'Expédiée', 'reserve stock': 'Stock réservé', 'reserve_stock': 'Stock réservé',
    'processing': 'En préparation', 'pending': 'En attente', 'pending_payment': 'Paiement en attente',
    'canceled': 'Annulée', 'cancelled': 'Annulée', 'complete': 'Terminée', 'closed': 'Clôturée',
    'delivered': 'Livrée', 'on hold': 'En attente', 'holded': 'En attente'
  }
  return labels[status.toLowerCase()] || status
}

export function mobileSentrixVisibleOrderLines(order: MobileSentrixOrder, smartphonesOnly: boolean) {
  return smartphonesOnly ? order.lines.filter(line => line.kind === 'smartphone') : order.lines
}

export function mobileSentrixOrderMatchesSearch(order: MobileSentrixOrder, query: string, smartphonesOnly = false) {
  if (!query.trim()) return true
  return supplierMatchesSearch(query, [order.number, order.status, mobileSentrixOrderStatus(order.status),
    order.createdAt, mobileSentrixOrderDate(order.createdAt), order.deliveryDate, mobileSentrixOrderDate(order.deliveryDate),
    order.carrier, order.trackingNumber, mobileSentrixOrderMoney(order.totalCents, order.currency),
    ...mobileSentrixVisibleOrderLines(order, smartphonesOnly).flatMap(line => [line.name, line.sku])])
}

export function mobileSentrixLinesSubtotal(lines: MobileSentrixOrderLine[]): number | null {
  if (!lines.length || lines.some(line => line.totalCents === null)) return null
  const total = lines.reduce((sum, line) => sum + line.totalCents!, 0)
  return Number.isSafeInteger(total) ? total : null
}

export function mergeMobileSentrixOrders(previous: MobileSentrixOrder[], incoming: MobileSentrixOrder[]) {
  return [...new Map([...previous, ...incoming].map(order => [order.id, order])).values()]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || b.id.localeCompare(a.id, 'en', { numeric: true }))
}
