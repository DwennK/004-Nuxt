import type { CustomerSmsSettingsRecord, SmsTemplateRecord } from '../types/settings'

export const freeSmsTemplateId = 'free'

export const smsTemplatePlaceholders = [
  '{{client_name}}',
  '{{dossier_number}}',
  '{{brand}}',
  '{{model}}'
] as const

export const defaultSmsTemplates: SmsTemplateRecord[] = [{
  id: 'repair-complete',
  label: 'Réparation terminée',
  body: 'Bonjour {{client_name}}, votre dossier {{dossier_number}} est prêt. Vous pouvez venir récupérer votre appareil.'
}, {
  id: 'quote-complete',
  label: 'Devis terminé',
  body: 'Bonjour {{client_name}}, le devis pour votre dossier {{dossier_number}} est prêt. Merci de nous contacter pour la suite.'
}, {
  id: 'order-received',
  label: 'Commande reçue',
  body: 'Bonjour {{client_name}}, la commande liée au dossier {{dossier_number}} est reçue. Nous pouvons poursuivre le traitement.'
}]

const legacySmsTemplates: SmsTemplateRecord[] = [{
  id: 'repair-complete',
  label: 'Réparation terminée',
  body: 'Bonjour {{client_name}}, votre ticket {{ticket_number}} est prêt. Vous pouvez venir récupérer votre appareil.'
}, {
  id: 'quote-complete',
  label: 'Devis terminé',
  body: 'Bonjour {{client_name}}, le devis pour votre ticket {{ticket_number}} est prêt. Merci de nous contacter pour la suite.'
}, {
  id: 'order-received',
  label: 'Commande reçue',
  body: 'Bonjour {{client_name}}, la commande liée au ticket {{ticket_number}} est reçue. Nous pouvons poursuivre le traitement.'
}]

export function getDefaultCustomerSmsSettings(): CustomerSmsSettingsRecord {
  return {
    templates: defaultSmsTemplates.map(template => ({ ...template }))
  }
}

export function parseCustomerSmsSettings(value: string | null | undefined): CustomerSmsSettingsRecord {
  if (!value) {
    return getDefaultCustomerSmsSettings()
  }

  try {
    const parsed = JSON.parse(value)
    const templates = Array.isArray(parsed?.templates) ? parsed.templates : null

    if (!templates) {
      return getDefaultCustomerSmsSettings()
    }

    const normalizedTemplates = templates
      .filter((template: unknown): template is SmsTemplateRecord => (
        Boolean(template)
        && typeof (template as SmsTemplateRecord).id === 'string'
        && typeof (template as SmsTemplateRecord).label === 'string'
        && typeof (template as SmsTemplateRecord).body === 'string'
      ))
      .map((template: SmsTemplateRecord) => ({
        id: template.id.trim(),
        label: template.label.trim(),
        body: template.body.trim()
      }))
      .filter((template: SmsTemplateRecord) => template.id && template.label && template.body)
      .map((template: SmsTemplateRecord) => {
        const index = legacySmsTemplates.findIndex(legacy => legacy.id === template.id
          && legacy.label === template.label && legacy.body === template.body)
        return index < 0 ? template : { ...defaultSmsTemplates[index]! }
      })

    return {
      templates: normalizedTemplates
    }
  } catch {
    return getDefaultCustomerSmsSettings()
  }
}

export function serializeCustomerSmsSettings(settings: CustomerSmsSettingsRecord) {
  return JSON.stringify({
    templates: settings.templates.map(template => ({
      id: template.id,
      label: template.label,
      body: template.body
    }))
  })
}

export function resolveSmsTemplateBody(template: SmsTemplateRecord, values: {
  clientName: string
  ticketNumber: string
  brand: string
  model: string
}) {
  return template.body
    .replaceAll('{{client_name}}', values.clientName)
    .replaceAll('{{dossier_number}}', values.ticketNumber)
    .replaceAll('{{ticket_number}}', values.ticketNumber)
    .replaceAll('{{brand}}', values.brand)
    .replaceAll('{{model}}', values.model)
}

export function normalizeSmsPhoneNumber(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  const trimmed = value.trim()
  const leadingPlus = trimmed.startsWith('+') ? '+' : ''
  const digits = trimmed.replace(/[^\d]/g, '')
  return `${leadingPlus}${digits}`
}

export function buildSmsHref(phoneNumber: string, body?: string | null) {
  if (!phoneNumber) {
    return ''
  }

  if (!body) {
    return `sms:${phoneNumber}`
  }

  return `sms:${phoneNumber}&body=${encodeURIComponent(body)}`
}
