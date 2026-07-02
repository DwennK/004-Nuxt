import {
  catalogItemTypeLabels,
  documentStatusLabels,
  documentTypeLabels,
  payableDocumentTypes,
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

export function calculateIncludedVatAmount(totalWithVat: number, vatRate: number) {
  if (vatRate <= 0) {
    return 0
  }

  const taxableBase = Math.round(totalWithVat / (1 + (vatRate / 100)))

  return totalWithVat - taxableBase
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

function groupThousands(value: string, separator: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
}

export function formatCurrency(cents: number, currency = 'CHF', locale = 'fr-CH') {
  if (locale === 'fr-CH' && currency === 'CHF') {
    const absoluteValue = Math.abs(Math.trunc(cents))
    const integerPart = Math.floor(absoluteValue / 100).toString()
    const fractionPart = String(absoluteValue % 100).padStart(2, '0')
    const sign = cents < 0 ? '-' : ''

    // Keep SSR and browser output identical. ICU data differs on fr-CH grouping.
    return `${sign}${groupThousands(integerPart, '\u202F')}.${fractionPart}\u00A0CHF`
  }

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

export const imeiLength = 15

export function normalizeImei(value: string | null | undefined) {
  const digits = (value || '').replace(/\D+/g, '')
  return digits || null
}

export function formatImei(value: string | null | undefined) {
  const digits = normalizeImei(value)

  if (!digits) {
    return ''
  }

  return digits.match(/.{1,3}/g)?.join(' ') || digits
}

export function isValidImei(value: string | null | undefined) {
  const digits = normalizeImei(value)

  if (!digits || digits.length !== imeiLength) {
    return false
  }

  let sum = 0

  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[index] || 0)
    const shouldDouble = index % 2 === 1
    const doubled = shouldDouble ? digit * 2 : digit
    sum += doubled > 9 ? doubled - 9 : doubled
  }

  return sum % 10 === 0
}

export function getImeiWarning(value: string | null | undefined) {
  const digits = normalizeImei(value)

  if (!digits) {
    return null
  }

  if (digits.length < imeiLength) {
    return 'IMEI incomplet. 15 chiffres attendus.'
  }

  if (digits.length > imeiLength) {
    return 'IMEI trop long. 15 chiffres attendus.'
  }

  if (!isValidImei(digits)) {
    return 'IMEI invalide. Vérifiez le chiffre de contrôle.'
  }

  return null
}

export function normalizeSearchText(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+/\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

export function isPayableDocumentType(value: DocumentType) {
  return payableDocumentTypes.includes(value as (typeof payableDocumentTypes)[number])
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

function computeEasterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export interface SwissHoliday {
  date: string
  name: string
}

export function getSwissHolidays(year: number): SwissHoliday[] {
  const easter = computeEasterDate(year)

  const goodFriday = addDays(easter, -2)
  const easterMonday = addDays(easter, 1)
  const ascension = addDays(easter, 39)
  const whitMonday = addDays(easter, 50)

  return [
    { date: `${year}-01-01`, name: 'Nouvel An' },
    { date: `${year}-01-02`, name: 'Saint-Berchtold' },
    { date: formatDateKey(goodFriday), name: 'Vendredi Saint' },
    { date: formatDateKey(easterMonday), name: 'Lundi de Pâques' },
    { date: formatDateKey(ascension), name: 'Ascension' },
    { date: formatDateKey(whitMonday), name: 'Lundi de Pentecôte' },
    { date: `${year}-08-01`, name: 'Fête nationale' },
    { date: `${year}-12-25`, name: 'Noël' },
    { date: `${year}-12-26`, name: 'Saint-Étienne' }
  ]
}

export function getSwissHolidaySet(year: number): Set<string> {
  return new Set(getSwissHolidays(year).map(h => h.date))
}

export function getSwissHolidayMap(year: number): Map<string, string> {
  return new Map(getSwissHolidays(year).map(h => [h.date, h.name]))
}

export function isWorkingDay(date: Date, holidaySet?: Set<string>): boolean {
  if (date.getDay() === 0) return false

  if (holidaySet) {
    const key = formatDateKey(date)
    if (holidaySet.has(key)) return false
  }

  return true
}

export function countBusinessDays(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr + 'T00:00:00')
  const end = new Date(endDateStr + 'T00:00:00')

  if (start > end) return 0

  const startYear = start.getFullYear()
  const endYear = end.getFullYear()
  const holidaySet = new Set<string>()
  for (let y = startYear; y <= endYear; y++) {
    for (const h of getSwissHolidays(y)) {
      holidaySet.add(h.date)
    }
  }

  let count = 0
  const current = new Date(start)

  while (current <= end) {
    if (isWorkingDay(current, holidaySet)) {
      count++
    }
    current.setDate(current.getDate() + 1)
  }

  return count
}

export function countBusinessDaysInYear(startDateStr: string, endDateStr: string, year: number): number {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const effectiveStart = startDateStr > yearStart ? startDateStr : yearStart
  const effectiveEnd = endDateStr < yearEnd ? endDateStr : yearEnd

  return countBusinessDays(effectiveStart, effectiveEnd)
}
