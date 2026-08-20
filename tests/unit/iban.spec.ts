import { describe, expect, it } from 'vitest'
import { isValidIban, isValidSwissQrBillAccount, normalizeIban } from '../../shared/utils/iban'

describe('IBAN helpers', () => {
  const swissIban = 'CH9300762011623852957'

  it('normalizes and validates a Swiss account', () => {
    expect(normalizeIban('ch93 0076 2011 6238 5295 7')).toBe(swissIban)
    expect(isValidIban(swissIban)).toBe(true)
    expect(isValidSwissQrBillAccount(swissIban)).toBe(true)
  })

  it('rejects malformed and non-Swiss QR-bill accounts', () => {
    expect(isValidIban('CH00INVALID')).toBe(false)
    expect(isValidSwissQrBillAccount('GB82WEST12345698765432')).toBe(false)
  })
})
