import type { CustomerRecord, DocumentDetail } from '../types/pos'
import type { CompanySettingsRecord } from '../types/settings'
import { isValidSwissQrBillAccount, normalizeIban } from './iban'

export interface SwissQrAddress {
  name: string
  street: string
  buildingNumber: string
  postalCode: string
  city: string
  country: string
}

export interface SwissQrBillData {
  account: string
  amount: string
  currency: 'CHF'
  creditor: SwissQrAddress
  debtor: SwissQrAddress | null
  displayReference: string
  message: string
  payload: string
}

function normalizeQrText(value: string | null | undefined) {
  return (value || '').replace(/\r?\n/g, ' ').trim()
}

function splitStreetLine(value: string | null | undefined) {
  const normalized = normalizeQrText(value)

  if (!normalized) {
    return {
      street: '',
      buildingNumber: ''
    }
  }

  const match = normalized.match(/^(.*?)[,\s]+(\d+[A-Za-z/-]*)$/)

  if (!match) {
    return {
      street: normalized,
      buildingNumber: ''
    }
  }

  return {
    street: match[1]?.trim() || normalized,
    buildingNumber: match[2]?.trim() || ''
  }
}

function buildStructuredAddress(input: {
  name: string | null | undefined
  streetLine: string | null | undefined
  postalCode: string | null | undefined
  city: string | null | undefined
  countryCode: string | null | undefined
}) {
  const name = normalizeQrText(input.name)
  const streetLine = normalizeQrText(input.streetLine)
  const postalCode = normalizeQrText(input.postalCode)
  const city = normalizeQrText(input.city)
  const country = normalizeQrText(input.countryCode).toUpperCase() || 'CH'

  if (!name || !streetLine || !postalCode || !city) {
    return null
  }

  const { street, buildingNumber } = splitStreetLine(streetLine)

  return {
    name,
    street,
    buildingNumber,
    postalCode,
    city,
    country
  } satisfies SwissQrAddress
}

function buildPayloadAddress(address: SwissQrAddress | null) {
  if (!address) {
    return ['', '', '', '', '', '', '']
  }

  return [
    'S',
    address.name,
    address.street,
    address.buildingNumber,
    address.postalCode,
    address.city,
    address.country
  ]
}

function formatQrAmount(cents: number) {
  return cents > 0 ? (cents / 100).toFixed(2) : ''
}

function buildDebtorAddress(customer: CustomerRecord) {
  return buildStructuredAddress({
    name: customer.displayName,
    streetLine: customer.addressLine1,
    postalCode: customer.postalCode,
    city: customer.city,
    countryCode: 'CH'
  })
}

export function buildSwissQrBill(document: DocumentDetail, company: CompanySettingsRecord) {
  if (document.type !== 'invoice') {
    return null
  }

  const account = normalizeIban(company.iban)

  if (!isValidSwissQrBillAccount(account)) {
    return null
  }

  const creditor = buildStructuredAddress({
    name: company.name,
    streetLine: company.address,
    postalCode: company.postalCode,
    city: company.city,
    countryCode: company.countryCode
  })

  if (!creditor) {
    return null
  }

  const debtor = buildDebtorAddress(document.customer)
  const displayReference = normalizeQrText(document.documentNumber)
  const message = displayReference

  const payload = [
    'SPC',
    '0200',
    '1',
    account,
    ...buildPayloadAddress(creditor),
    ...buildPayloadAddress(null),
    formatQrAmount(document.total),
    'CHF',
    ...buildPayloadAddress(debtor),
    'NON',
    '',
    message,
    'EPD',
    '',
    '',
    ''
  ].join('\r\n')

  return {
    account,
    amount: formatQrAmount(document.total),
    currency: 'CHF',
    creditor,
    debtor,
    displayReference,
    message,
    payload
  } satisfies SwissQrBillData
}
