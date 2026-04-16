import { documentTypeLabels, paymentMethodLabels } from '../constants/pos'
import type { DocumentDetail } from '../types/pos'
import type { CompanySettingsRecord } from '../types/settings'
import { isValidSwissQrBillAccount } from './iban'
import { formatDateTime, isPayableDocumentType } from './pos'
import { buildSwissQrBill, type SwissQrBillData } from './qr-bill'

export interface DocumentPrintPaymentSummary {
  label: string
  paidAt: string
}

export interface DocumentPrintNoteBlock {
  label: string
  content: string
}

export interface DocumentA4PrintModel {
  documentTitle: string
  companyAddress: string[]
  customerAddress: string[]
  windowLines: string[]
  referenceLines: string[]
  noteBlocks: DocumentPrintNoteBlock[]
  footerNote: string | null
  footerMeta: string[]
  paymentSummary: DocumentPrintPaymentSummary | null
  paidAmount: number
  balanceDue: number
  isPayableDocument: boolean
  qrBill: SwissQrBillData | null
}

export function buildDocumentPaymentSummary(document: DocumentDetail): DocumentPrintPaymentSummary | null {
  if (!document.payments.length) {
    return null
  }

  const latestPaid = [...document.payments]
    .filter(payment => payment.status === 'paid')
    .sort((left, right) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime())[0]

  if (!latestPaid) {
    return null
  }

  return {
    label: paymentMethodLabels[latestPaid.method],
    paidAt: formatDateTime(latestPaid.paidAt)
  }
}

function getCompanyAddress(company: CompanySettingsRecord) {
  return [
    company.address,
    [company.postalCode, company.city].filter(Boolean).join(' ').trim() || null
  ].filter(Boolean) as string[]
}

function getCustomerAddress(document: DocumentDetail) {
  return [
    document.customer.addressLine1,
    document.customer.addressLine2,
    [document.customer.postalCode, document.customer.city].filter(Boolean).join(' ').trim() || null
  ].filter(Boolean) as string[]
}

function getQrBillNotice(document: DocumentDetail, company: CompanySettingsRecord, qrBill: SwissQrBillData | null) {
  if (document.type !== 'invoice' || qrBill) {
    return null
  }

  if (!company.iban) {
    return 'QR-facture indisponible: ajoutez un IBAN dans les paramètres société.'
  }

  if (!isValidSwissQrBillAccount(company.iban)) {
    return 'QR-facture indisponible: utilisez un IBAN CH ou LI valide dans les paramètres société.'
  }

  if (!company.address || !company.postalCode || !company.city) {
    return 'QR-facture indisponible: complétez l’adresse société pour générer le paiement QR.'
  }

  return null
}

export function buildDocumentA4PrintModel(document: DocumentDetail, company: CompanySettingsRecord): DocumentA4PrintModel {
  const paymentSummary = buildDocumentPaymentSummary(document)
  const companyAddress = getCompanyAddress(company)
  const customerAddress = getCustomerAddress(document)
  const qrBill = buildSwissQrBill(document, company)
  const qrBillNotice = getQrBillNotice(document, company, qrBill)
  const paidAmount = document.payments
    .filter(payment => payment.status === 'paid')
    .reduce((total, payment) => total + payment.amount, 0)
  const isPayableDocument = isPayableDocumentType(document.type)
  const balanceDue = isPayableDocument ? Math.max(document.total - paidAmount, 0) : 0
  const noteBlocks: DocumentPrintNoteBlock[] = []

  if (document.notes) {
    noteBlocks.push({
      label: 'Notes',
      content: document.notes
    })
  }

  if (company.paymentTerms) {
    noteBlocks.push({
      label: 'Conditions de paiement',
      content: company.paymentTerms
    })
  }

  if (qrBillNotice) {
    noteBlocks.push({
      label: 'Paiement QR',
      content: qrBillNotice
    })
  }

  return {
    documentTitle: documentTypeLabels[document.type],
    companyAddress,
    customerAddress,
    windowLines: [
      document.customer.displayName,
      ...(customerAddress.length
        ? customerAddress
        : [document.customer.phone, document.customer.email].filter(Boolean) as string[])
    ],
    referenceLines: [
      company.vatNumber ? `TVA / IDE ${company.vatNumber}` : null,
      company.bankName ? `Banque ${company.bankName}` : null,
      company.iban ? `IBAN ${company.iban}` : null,
      paymentSummary ? `Dernier paiement ${paymentSummary.label}` : null,
      paymentSummary ? paymentSummary.paidAt : null
    ].filter(Boolean) as string[],
    noteBlocks,
    footerNote: company.footerNotes,
    footerMeta: [company.phone, company.email, company.website].filter(Boolean) as string[],
    paymentSummary,
    paidAmount,
    balanceDue,
    isPayableDocument,
    qrBill
  }
}
