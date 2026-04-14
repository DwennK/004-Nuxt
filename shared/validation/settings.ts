import { z } from 'zod'
import { isValidIban } from '../utils/iban'

const optionalText = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim()
  return normalized === '' ? null : normalized
}, z.string().nullable().optional().transform(value => value ?? null))

const optionalEmail = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim()
  return normalized === '' ? null : normalized
}, z.union([
  z.string().email('Un e-mail valide est obligatoire'),
  z.null()
]).transform(value => value ?? null))

const optionalCountryCode = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim().toUpperCase()
  return normalized === '' ? null : normalized
}, z.union([
  z.string().length(2, 'Le code pays doit contenir 2 lettres'),
  z.null()
]).transform(value => value ?? null))

const optionalLogo = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim()
  return normalized === '' ? null : normalized
}, z.union([
  z.string().startsWith('data:', 'Le logo doit être une image valide'),
  z.null()
]).transform(value => value ?? null))

const optionalIban = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim().toUpperCase()
  return normalized === '' ? null : normalized
}, z.union([
  z.string().refine(value => isValidIban(value), 'L’IBAN doit être valide.'),
  z.null()
]).transform(value => value ?? null))

export const companySettingsInputSchema = z.object({
  name: z.string().trim().min(1, 'Le nom de la société est obligatoire'),
  address: optionalText,
  postalCode: optionalText,
  city: optionalText,
  countryCode: optionalCountryCode,
  phone: optionalText,
  email: optionalEmail,
  website: optionalText,
  vatNumber: optionalText,
  bankName: optionalText,
  iban: optionalIban,
  paymentTerms: optionalText,
  footerNotes: optionalText,
  logoDataUrl: optionalLogo
})

export const smsTemplateSchema = z.object({
  id: z.string().trim().min(1, 'L’identifiant est obligatoire'),
  label: z.string().trim().min(1, 'Le libelle est obligatoire'),
  body: z.string().trim().min(1, 'Le message est obligatoire')
})

export const customerSmsSettingsInputSchema = z.object({
  templates: z.array(smsTemplateSchema)
})
