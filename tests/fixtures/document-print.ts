import type { DocumentDetail, PaymentRecord } from '../../shared/types/pos'
import type { CompanySettingsRecord } from '../../shared/types/settings'

const timestamp = '2026-09-08T12:00:00.000Z'

export function printPayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 1, customerId: 1, documentId: 1, method: 'cash', status: 'paid', amount: 2500,
    paidAt: timestamp, notes: null, createdAt: timestamp, updatedAt: timestamp,
    ...overrides
  }
}

export function printDocument(overrides: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    id: 1, documentNumber: 'FA-TEST-001', type: 'invoice', status: 'issued',
    customerId: 1, ticketId: null, issuedAt: timestamp, subtotal: 9251, taxAmount: 749,
    total: 10000, notes: null, createdAt: timestamp, updatedAt: timestamp,
    customer: {
      id: 1, firstName: 'Camille', lastName: 'Exemple', displayName: 'Camille Exemple',
      companyName: null, phone: '', email: '', addressLine1: 'Rue du Test 8', addressLine2: null,
      postalCode: '2000', city: 'Neuchâtel', notes: null, createdAt: timestamp, updatedAt: timestamp
    },
    ticket: null,
    lines: [{ id: 1, documentId: 1, label: 'Prestation de test', quantity: 1, unitPrice: 10000, vatRate: 8.1, lineTotal: 10000, categoryHint: null }],
    payments: [],
    ...overrides
  }
}

export function printCompany(): CompanySettingsRecord {
  return {
    id: 1, name: 'Magasin de test', address: 'Rue du Commerce 1', postalCode: '2000', city: 'Neuchâtel',
    countryCode: 'CH', phone: null, email: null, website: null, vatNumber: null, bankName: null,
    iban: 'CH9300762011623852957', paymentTerms: null, footerNotes: null, logoDataUrl: null,
    createdAt: timestamp, updatedAt: timestamp
  }
}
