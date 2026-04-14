import { eq } from 'drizzle-orm'
import { companySettings, tickets } from '~~/server/db/schema'
import type { CustomerSmsSettingsInput, CustomerSmsSettingsRecord } from '~~/shared/types/settings'
import {
  parseCustomerSmsSettings,
  serializeCustomerSmsSettings
} from '~~/shared/utils/customer-sms'
import { useDb } from './turso'
import { createTicketEvent, ensurePosSchema } from './pos/core'

const COMPANY_SETTINGS_ID = 1

export async function getCustomerSmsSettings(): Promise<CustomerSmsSettingsRecord> {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.select({
    customerSmsTemplatesJson: companySettings.customerSmsTemplatesJson
  })
    .from(companySettings)
    .where(eq(companySettings.id, COMPANY_SETTINGS_ID))
    .limit(1)

  return parseCustomerSmsSettings(rows[0]?.customerSmsTemplatesJson)
}

export async function updateCustomerSmsSettings(input: CustomerSmsSettingsInput): Promise<CustomerSmsSettingsRecord> {
  await ensurePosSchema()

  const db = useDb()
  const nextSettings = {
    templates: input.templates.map(template => ({
      id: template.id.trim(),
      label: template.label.trim(),
      body: template.body.trim()
    }))
  }
  const now = new Date().toISOString()
  const serializedSettings = serializeCustomerSmsSettings(nextSettings)
  const existing = await db.select({ id: companySettings.id })
    .from(companySettings)
    .where(eq(companySettings.id, COMPANY_SETTINGS_ID))
    .limit(1)

  if (!existing[0]) {
    await db.insert(companySettings).values({
      id: COMPANY_SETTINGS_ID,
      name: 'Microwest POS',
      customerSmsTemplatesJson: serializedSettings,
      createdAt: now,
      updatedAt: now
    })
  } else {
    await db.update(companySettings)
      .set({
        customerSmsTemplatesJson: serializedSettings,
        updatedAt: now
      })
      .where(eq(companySettings.id, COMPANY_SETTINGS_ID))
  }

  return nextSettings
}

export async function logTicketSmsQrOpened(ticketId: number, input: {
  templateId: string | null
  templateLabel: string
  mode: 'template' | 'free'
}) {
  await ensurePosSchema()

  const db = useDb()
  const existing = await db.select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)

  if (!existing[0]) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Ticket not found'
    })
  }

  await createTicketEvent({
    ticketId,
    kind: 'ticket_sms_qr_opened',
    label: `QR SMS affiché · ${input.templateLabel}`,
    metadata: {
      templateId: input.templateId,
      templateLabel: input.templateLabel,
      mode: input.mode
    }
  })
}
