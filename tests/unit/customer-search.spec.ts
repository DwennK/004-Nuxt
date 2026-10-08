import { describe, expect, it } from 'vitest'
import { matchesCustomerSearch } from '../../shared/utils/search'

describe('complete customer name search in the selector', () => {
  const customer = { name: 'Élodie Anne de La Tour', companyName: 'Atelier Pixel', phone: '0791234567', email: 'contact@example.test' }
  it.each(['elodie', 'tour elodie', 'ÉLODIE ANNE', 'pixel', '079123', 'contact@example'])('keeps the customer visible for %s', (search) => {
    expect(matchesCustomerSearch(customer, search)).toBe(true)
  })
  it('does not expose unrelated cached customers', () => {
    expect(matchesCustomerSearch(customer, 'Jean Dupont')).toBe(false)
    expect(matchesCustomerSearch(customer, 'elodie dupont')).toBe(false)
  })
})
