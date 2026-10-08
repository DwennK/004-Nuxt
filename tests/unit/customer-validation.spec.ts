import { describe, expect, it } from 'vitest'
import { customerInputSchema } from '../../shared/validation/pos'

describe('customer validation', () => {
  it('accepts a counter customer without an email property', () => {
    expect(customerInputSchema.parse({
      name: 'Client comptoir',
      notes: 'Client créé automatiquement pour les ventes rapides sans client nominatif.'
    })).toMatchObject({
      name: 'Client comptoir',
      email: null
    })
  })

  it.each([
    { label: 'undefined', email: undefined },
    { label: 'an empty string', email: '' },
    { label: 'null', email: null }
  ])('normalizes $label to null', ({ email }) => {
    expect(customerInputSchema.parse({
      name: 'Client test',
      email
    }).email).toBeNull()
  })

  it('normalizes a valid email and rejects an invalid one', () => {
    expect(customerInputSchema.parse({
      name: 'Client test',
      email: ' client@example.com '
    }).email).toBe('client@example.com')

    expect(customerInputSchema.safeParse({
      name: 'Client test',
      email: 'client-invalide'
    }).success).toBe(false)
  })
})
