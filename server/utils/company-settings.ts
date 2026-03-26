import { eq } from 'drizzle-orm'
import { companySettings } from '~~/server/db/schema'
import type { CompanySettingsInput, CompanySettingsRecord } from '~~/shared/types/settings'
import { useDb } from './turso'
import { ensurePosSchema, normalizeOptionalText, normalizeRequiredText } from './pos/core'

const COMPANY_SETTINGS_ID = 1

function mapCompanySettings(row: typeof companySettings.$inferSelect): CompanySettingsRecord {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    postalCode: row.postalCode,
    city: row.city,
    countryCode: row.countryCode,
    phone: row.phone,
    email: row.email,
    website: row.website,
    vatNumber: row.vatNumber,
    bankName: row.bankName,
    iban: row.iban,
    paymentTerms: row.paymentTerms,
    footerNotes: row.footerNotes,
    logoDataUrl: row.logoDataUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export async function getCompanySettings() {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.select().from(companySettings).where(eq(companySettings.id, COMPANY_SETTINGS_ID)).limit(1)
  const row = rows[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Company settings not found'
    })
  }

  return mapCompanySettings(row)
}

export async function updateCompanySettings(input: CompanySettingsInput) {
  await ensurePosSchema()

  const db = useDb()
  const now = new Date().toISOString()
  const existing = await db.select().from(companySettings).where(eq(companySettings.id, COMPANY_SETTINGS_ID)).limit(1)

  if (!existing[0]) {
    const inserted = await db.insert(companySettings).values({
      id: COMPANY_SETTINGS_ID,
      name: normalizeRequiredText(input.name),
      address: normalizeOptionalText(input.address),
      postalCode: normalizeOptionalText(input.postalCode),
      city: normalizeOptionalText(input.city),
      countryCode: normalizeOptionalText(input.countryCode)?.toUpperCase() || null,
      phone: normalizeOptionalText(input.phone),
      email: normalizeOptionalText(input.email),
      website: normalizeOptionalText(input.website),
      vatNumber: normalizeOptionalText(input.vatNumber),
      bankName: normalizeOptionalText(input.bankName),
      iban: normalizeOptionalText(input.iban),
      paymentTerms: normalizeOptionalText(input.paymentTerms),
      footerNotes: normalizeOptionalText(input.footerNotes),
      logoDataUrl: normalizeOptionalText(input.logoDataUrl),
      createdAt: now,
      updatedAt: now
    }).returning()

    return mapCompanySettings(inserted[0]!)
  }

  const updated = await db.update(companySettings)
    .set({
      name: normalizeRequiredText(input.name),
      address: normalizeOptionalText(input.address),
      postalCode: normalizeOptionalText(input.postalCode),
      city: normalizeOptionalText(input.city),
      countryCode: normalizeOptionalText(input.countryCode)?.toUpperCase() || null,
      phone: normalizeOptionalText(input.phone),
      email: normalizeOptionalText(input.email),
      website: normalizeOptionalText(input.website),
      vatNumber: normalizeOptionalText(input.vatNumber),
      bankName: normalizeOptionalText(input.bankName),
      iban: normalizeOptionalText(input.iban),
      paymentTerms: normalizeOptionalText(input.paymentTerms),
      footerNotes: normalizeOptionalText(input.footerNotes),
      logoDataUrl: normalizeOptionalText(input.logoDataUrl),
      updatedAt: now
    })
    .where(eq(companySettings.id, COMPANY_SETTINGS_ID))
    .returning()

  return mapCompanySettings(updated[0]!)
}
