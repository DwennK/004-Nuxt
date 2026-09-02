import type { OutgoingMail } from '../../server/utils/email/transport'

export function mailFixture(): OutgoingMail {
  return {
    from: 'Microwest <info@microwest.ch>', to: 'client@example.test', replyTo: 'info@microwest.ch',
    subject: 'Facture FA-123', text: 'Bonjour, voici votre facture.\nMerci !',
    attachments: [{ filename: 'FA-123.pdf', type: 'application/pdf', content: new TextEncoder().encode('%PDF-1.7\nTest') }]
  }
}

export function deliveryEvent(status = 'delivered', options: { id?: string, messageId?: string, at?: string } = {}) {
  return {
    type: `cf.email.sending.message.${status}`,
    source: { type: 'email.sending', domain: 'microwest.ch' },
    payload: {
      eventId: options.id || crypto.randomUUID(), messageId: options.messageId || 'cf-message-1',
      sender: 'info@microwest.ch', recipient: 'client@example.test', delivery: { status }
    },
    metadata: { eventSchemaVersion: 1, eventTimestamp: options.at || new Date().toISOString() }
  }
}
