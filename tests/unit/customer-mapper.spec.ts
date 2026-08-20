import { describe, expect, it } from 'vitest'
import { mapCustomer } from '../../server/modules/customers/mapper'

describe('customer row mapper', () => {
  it('preserves persisted fields and derives the person display name', () => {
    expect(mapCustomer({
      id: 42,
      firstName: 'Ada',
      lastName: 'Lovelace',
      companyName: null,
      phone: '+41 22 555 01 02',
      email: 'ada@example.test',
      addressLine1: '1 Rue du Test',
      addressLine2: null,
      postalCode: '1201',
      city: 'Genève',
      notes: null,
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-02-03T04:05:06.000Z'
    })).toEqual({
      id: 42,
      firstName: 'Ada',
      lastName: 'Lovelace',
      companyName: null,
      phone: '+41 22 555 01 02',
      email: 'ada@example.test',
      addressLine1: '1 Rue du Test',
      addressLine2: null,
      postalCode: '1201',
      city: 'Genève',
      notes: null,
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-02-03T04:05:06.000Z',
      displayName: 'Ada Lovelace'
    })
  })

  it('uses the trimmed company name for display without rewriting stored data', () => {
    const mapped = mapCustomer({
      id: 7,
      firstName: 'Grace',
      lastName: 'Hopper',
      companyName: '  Microwest  ',
      phone: '',
      email: '',
      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      city: null,
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    })

    expect(mapped.companyName).toBe('  Microwest  ')
    expect(mapped.displayName).toBe('Microwest')
  })
})
