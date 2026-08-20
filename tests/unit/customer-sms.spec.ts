import { describe, expect, it } from 'vitest'
import {
  buildSmsHref,
  defaultSmsTemplates,
  normalizeSmsPhoneNumber,
  parseCustomerSmsSettings,
  resolveSmsTemplateBody,
  serializeCustomerSmsSettings
} from '../../shared/utils/customer-sms'

describe('customer SMS settings', () => {
  it('falls back to independent defaults for malformed JSON', () => {
    const first = parseCustomerSmsSettings('{broken')
    const second = parseCustomerSmsSettings(null)

    expect(first.templates).toEqual(defaultSmsTemplates)
    expect(first.templates).not.toBe(second.templates)
  })

  it('normalizes valid templates and discards incomplete entries', () => {
    const settings = parseCustomerSmsSettings(JSON.stringify({
      templates: [
        { id: ' ready ', label: ' Prêt ', body: ' Bonjour {{client_name}} ' },
        { id: '', label: 'Invalide', body: 'Texte' }
      ]
    }))

    expect(settings.templates).toEqual([{
      id: 'ready',
      label: 'Prêt',
      body: 'Bonjour {{client_name}}'
    }])
    expect(JSON.parse(serializeCustomerSmsSettings(settings))).toEqual({ templates: settings.templates })
  })

  it('resolves placeholders and builds an encoded SMS URL', () => {
    const body = resolveSmsTemplateBody({
      id: 'ready',
      label: 'Prêt',
      body: '{{client_name}} · {{ticket_number}} · {{brand}} {{model}}'
    }, {
      clientName: 'Zoé',
      ticketNumber: 'TIC-42',
      brand: 'Apple',
      model: 'iPhone'
    })
    const phone = normalizeSmsPhoneNumber('+41 79 123 45 67')

    expect(phone).toBe('+41791234567')
    expect(buildSmsHref(phone, body)).toBe(`sms:${phone}&body=${encodeURIComponent(body)}`)
  })
})
