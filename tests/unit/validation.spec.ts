import { describe, expect, it } from 'vitest'
import {
  commercialLineInputSchema,
  createAndPayDocumentSchema,
  documentInputSchema,
  markDocumentPaidSchema,
  mobileSentrixProductsQuerySchema,
  ticketNoteInputSchema
} from '../../shared/validation/pos'
import { postalCodeLookupQuerySchema } from '../../shared/validation/lookups'
import { queryBooleanSchema } from '../../shared/validation/api'

describe('commercial validation', () => {
  it('requires an explicit nullable customer only on a ticketless quick sale', () => {
    const document = {
      type: 'invoice', customerId: null, issuedAt: '2026-09-02T12:00:00.000Z',
      lines: [{ label: 'Article', quantity: 1, unitPrice: 1000, vatRate: 8.1 }]
    }
    const payment = { method: 'cash', paidAt: document.issuedAt }
    expect(createAndPayDocumentSchema.parse({ document, payment }).document.customerId).toBeNull()
    expect(createAndPayDocumentSchema.safeParse({ document: { ...document, customerId: undefined }, payment }).success).toBe(false)
    expect(createAndPayDocumentSchema.safeParse({ document: { ...document, ticketId: 7 }, payment }).success).toBe(false)
    expect(createAndPayDocumentSchema.safeParse({ document: { ...document, customerId: 1, ticketId: 7 }, payment }).success).toBe(true)
    expect(documentInputSchema.safeParse(document).success).toBe(false)
  })

  it('accepts negative TTC unit prices but keeps quantity positive', () => {
    expect(commercialLineInputSchema.parse({
      label: 'Remise commerciale',
      quantity: '2',
      unitPrice: '-500',
      vatRate: '8.1'
    })).toMatchObject({
      quantity: 2,
      unitPrice: -500,
      vatRate: 8.1
    })

    expect(commercialLineInputSchema.safeParse({
      label: 'Remise commerciale',
      quantity: 0,
      unitPrice: -500,
      vatRate: 8.1
    }).success).toBe(false)
  })

  it('requires stable timestamps on idempotent financial mutations', () => {
    const document = {
      type: 'invoice',
      customerId: 1,
      lines: [{ label: 'Service', quantity: 1, unitPrice: 1000, vatRate: 8.1 }]
    }

    expect(documentInputSchema.safeParse(document).success).toBe(false)
    expect(markDocumentPaidSchema.safeParse({ method: 'cash' }).success).toBe(false)
    expect(createAndPayDocumentSchema.safeParse({
      document,
      payment: { method: 'cash' }
    }).success).toBe(false)
  })
})

describe('query validation', () => {
  it('applies safe pagination and boolean defaults', () => {
    expect(mobileSentrixProductsQuerySchema.parse({})).toMatchObject({
      deviceProducts: false,
      page: 1,
      limit: 20
    })
  })

  it('parses a valid Swiss postal-code lookup', () => {
    expect(postalCodeLookupQuerySchema.parse({ postalCode: ' 1204 ' })).toEqual({ postalCode: '1204' })
  })

  it('parses explicit query-string booleans without treating "false" as truthy', () => {
    expect(queryBooleanSchema.parse('true')).toBe(true)
    expect(queryBooleanSchema.parse('false')).toBe(false)
    expect(queryBooleanSchema.safeParse('0').success).toBe(false)
  })
})

describe('ticket note validation', () => {
  it('accepts a useful note and rejects blank or oversized entries', () => {
    expect(ticketNoteInputSchema.parse({ note: '  Client appelé, pièce commandée.  ' })).toEqual({
      note: 'Client appelé, pièce commandée.'
    })
    expect(ticketNoteInputSchema.safeParse({ note: '   ' }).success).toBe(false)
    expect(ticketNoteInputSchema.safeParse({ note: 'x'.repeat(2001) }).success).toBe(false)
  })
})
