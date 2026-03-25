import {
  catalogItemTypeLabels,
  documentStatusLabels,
  documentTypeLabels,
  lineCategoryLabels,
  paymentMethodLabels,
  paymentStatusLabels,
  ticketStatusLabels,
  ticketTypeLabels
} from '../constants/pos'
import type {
  CatalogItemType,
  DocumentStatus,
  DocumentType,
  LineCategoryHint,
  PaymentMethod,
  PaymentStatus,
  TicketStatus,
  TicketType
} from '../types/pos'

export const businessTimeZone = 'Europe/Zurich'

export function toIsoDateTime(value = new Date()) {
  return value.toISOString()
}

export function getTimeZoneOffsetMinutes(value: Date, timeZone = businessTimeZone) {
  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset'
  }).formatToParts(value).find(part => part.type === 'timeZoneName')?.value || 'GMT+0'

  const match = timeZoneName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/)

  if (!match) {
    return 0
  }

  const hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)

  return hours * 60 + (hours >= 0 ? minutes : -minutes)
}

export function toDateInputValue(value = new Date(), timeZone = businessTimeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(value)
}

export function formatDateTime(value: string | Date, locale = 'fr-CH', timeZone = businessTimeZone) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : ''
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone
  }).format(date)
}

export function formatDate(value: string | Date, locale = 'fr-CH', timeZone = businessTimeZone) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : ''
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone
  }).format(date)
}

export function buildZonedDayRange(date: string, timeZone = businessTimeZone) {
  const [year, month, day] = date.split('-').map(Number)
  const offsetStart = getTimeZoneOffsetMinutes(new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0)), timeZone)
  const offsetEnd = getTimeZoneOffsetMinutes(new Date(Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999)), timeZone)

  const start = new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0) - offsetStart * 60_000)
  const end = new Date(Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999) - offsetEnd * 60_000)

  return {
    start: start.toISOString(),
    end: end.toISOString()
  }
}

export function formatCurrency(cents: number, currency = 'CHF', locale = 'fr-CH') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(cents / 100)
}

export function parseCurrencyInput(value: string | number) {
  if (typeof value === 'number') {
    return Math.round(value * 100)
  }

  const normalized = value.replace(/[^0-9,.-]/g, '').replace(',', '.').trim()
  const parsed = Number(normalized)

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.round(parsed * 100)
}

export function formatCustomerName(customer: {
  firstName: string
  lastName: string
  companyName?: string | null
}) {
  const personName = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim()
  return customer.companyName?.trim() || personName || 'Unknown customer'
}

export function getTicketTypeLabel(value: TicketType) {
  return ticketTypeLabels[value]
}

export function getTicketStatusLabel(value: TicketStatus) {
  return ticketStatusLabels[value]
}

export function getDocumentTypeLabel(value: DocumentType) {
  return documentTypeLabels[value]
}

export function getDocumentStatusLabel(value: DocumentStatus) {
  return documentStatusLabels[value]
}

export function getPaymentMethodLabel(value: PaymentMethod) {
  return paymentMethodLabels[value]
}

export function getPaymentStatusLabel(value: PaymentStatus) {
  return paymentStatusLabels[value]
}

export function getCatalogItemTypeLabel(value: CatalogItemType) {
  return catalogItemTypeLabels[value]
}

export function getLineCategoryLabel(value: LineCategoryHint | null | undefined) {
  return value ? lineCategoryLabels[value] : 'Other'
}

export function sumMoney(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (value || 0), 0)
}
