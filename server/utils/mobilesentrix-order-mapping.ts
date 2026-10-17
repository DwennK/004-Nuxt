import { createError } from 'h3'
import type { MobileSentrixOrder, MobileSentrixOrderLine } from '~~/shared/types/mobilesentrix-orders'
import { mobileSentrixCalendarDate, mobileSentrixOrderLineKind } from '~~/shared/utils/mobilesentrix-orders'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : null
}

function invalidPayload(): never {
  throw createError({ statusCode: 502, message: 'Réponse commandes MobileSentrix invalide. Réessayez.' })
}

export function mobileSentrixOrderCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object' || Object.keys(value).some(key => !/^\d+$/.test(key))) return invalidPayload()
  return Object.values(value)
}

function cents(value: unknown): number | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text(value) || '')
  if (!match) return null
  const fraction = (match[3] || '').padEnd(3, '0')
  const result = (Number(match[2]) * 100 + Number(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1 : 0)) * (match[1] ? -1 : 1)
  return Number.isSafeInteger(result) ? result : null
}

function quantity(value: unknown) {
  const source = text(value)
  if (!source || !/^\d+(?:\.0+)?$/.test(source)) return null
  const number = Number(source)
  return Number.isSafeInteger(number) ? number : null
}

function mapLine(value: unknown): MobileSentrixOrderLine {
  const line = record(value)
  const id = text(line.item_id)
  const name = text(line.name)
  if (!id || !/^\d+$/.test(id) || !name) return invalidPayload()
  return {
    id, name, sku: text(line.sku), quantity: quantity(line.qty_ordered), shippedQuantity: quantity(line.qty_shipped),
    // Never mix an ex-tax price into the TTC column when the inclusive value is missing.
    unitPriceCents: cents(line.price_incl_tax), totalCents: cents(line.row_total_incl_tax),
    kind: mobileSentrixOrderLineKind(line.product_attribute_setid, name)
  }
}

export function mapMobileSentrixOrder(value: unknown): MobileSentrixOrder {
  const order = record(value)
  const id = text(order.entity_id)
  const number = text(order.increment_id)
  if (!id || !/^[1-9]\d{0,19}$/.test(id) || !number) return invalidPayload()
  const createdAt = mobileSentrixCalendarDate(order.created_at) ? text(order.created_at)!.replace('T', ' ') : null
  const currency = text(order.store_currency_code)
  const carrier = text(order.shipping_description)
  const trackingNumber = text(order.tracking_number)
  const trackingUrl = carrier && /\bfedex\b/i.test(carrier) && trackingNumber && /^\d{10,22}$/.test(trackingNumber)
    ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`
    : null
  return {
    id, number, createdAt, status: text(order.status) || 'Non communiqué',
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    totalCents: cents(order.grand_total), deliveryDate: mobileSentrixCalendarDate(order.delivery_date),
    carrier, trackingNumber, trackingUrl,
    lines: mobileSentrixOrderCollection(order.order_items).map(mapLine)
  }
}
