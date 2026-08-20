import { describe, expect, it } from 'vitest'
import {
  commercialLineInputSchema,
  createAndPayDocumentSchema,
  documentInputSchema,
  markDocumentPaidSchema,
  mobileSentrixProductsQuerySchema
} from '../../shared/validation/pos'
import { postalCodeLookupQuerySchema } from '../../shared/validation/lookups'
import { queryBooleanSchema } from '../../shared/validation/api'

describe('commercial validation', () => {
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
