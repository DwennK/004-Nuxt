import { describe, expect, it } from 'vitest'
import { companySettingsInputSchema } from '../../shared/validation/settings'

describe('company settings validation', () => {
  it('accepts omitted optional structured fields and normalizes them to null', () => {
    expect(companySettingsInputSchema.parse({
      name: 'Microwest'
    })).toMatchObject({
      email: null,
      countryCode: null,
      logoDataUrl: null,
      iban: null
    })
  })

  it('normalizes empty optional structured fields to null', () => {
    expect(companySettingsInputSchema.parse({
      name: 'Microwest',
      email: ' ',
      countryCode: '',
      logoDataUrl: ' ',
      iban: ''
    })).toMatchObject({
      email: null,
      countryCode: null,
      logoDataUrl: null,
      iban: null
    })
  })

  it('normalizes valid values and keeps invalid values rejected', () => {
    expect(companySettingsInputSchema.parse({
      name: 'Microwest',
      email: ' contact@example.com ',
      countryCode: ' ch ',
      logoDataUrl: ' data:image/png;base64,AAAA ',
      iban: ' ch93 0076 2011 6238 5295 7 '
    })).toMatchObject({
      email: 'contact@example.com',
      countryCode: 'CH',
      logoDataUrl: 'data:image/png;base64,AAAA',
      iban: 'CH93 0076 2011 6238 5295 7'
    })

    expect(companySettingsInputSchema.safeParse({
      name: 'Microwest',
      email: 'adresse-invalide',
      countryCode: 'Suisse',
      logoDataUrl: 'https://example.com/logo.png',
      iban: 'CH00'
    }).success).toBe(false)
  })
})
