import { z } from 'zod'
import { normalizeImei } from '../utils/pos'
import {
  catalogItemTypes,
  documentStatuses,
  documentTypes,
  lineCategoryHints,
  paymentMethods,
  paymentStatuses,
  ticketStatuses,
  ticketTypes,
  vacationEntryStatuses,
  vacationEntryTypes
} from '../constants/pos'

const optionalText = z.string().trim().optional().nullable().transform((value) => {
  if (!value) {
    return null
  }

  return value.trim() || null
})

const optionalEmail = z.union([
  z.string().trim().email('Un e-mail valide est obligatoire'),
  z.literal(''),
  z.null(),
  z.undefined()
]).transform((value) => {
  if (!value) {
    return null
  }

  return value.trim() || null
})

const optionalImei = optionalText.transform((value) => {
  return normalizeImei(value)
})

export const customerInputSchema = z.object({
  displayName: optionalText,
  firstName: optionalText,
  lastName: optionalText,
  companyName: optionalText,
  phone: optionalText,
  email: optionalEmail,
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: optionalText,
  city: optionalText,
  notes: optionalText
}).superRefine((value, ctx) => {
  const hasIdentity = Boolean(
    value.displayName
    || value.companyName
    || value.firstName
    || value.lastName
  )

  if (!hasIdentity) {
    ctx.addIssue({
      code: 'custom',
      path: ['displayName'],
      message: 'Le nom du client ou de la société est obligatoire'
    })
  }
})

export const catalogItemInputSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire'),
  sku: optionalText,
  type: z.enum(catalogItemTypes),
  category: z.string().trim().min(1, 'La catégorie est obligatoire'),
  brand: optionalText,
  model: optionalText,
  serviceKind: optionalText,
  keywords: z.array(z.string().trim().min(1)).default([]),
  defaultPrice: z.coerce.number().int().min(0),
  vatRate: z.coerce.number().min(0).max(100),
  isActive: z.coerce.boolean().default(true)
}).superRefine((value, ctx) => {
  if ((value.type === 'repair' || value.type === 'service') && !value.serviceKind) {
    ctx.addIssue({
      code: 'custom',
      path: ['serviceKind'],
      message: value.type === 'repair'
        ? 'Le type d’intervention est obligatoire pour une réparation'
        : 'La nature du service est obligatoire'
    })
  }
})

export const commercialLineInputSchema = z.object({
  catalogItemId: z.coerce.number().int().positive().optional().nullable(),
  label: z.string().trim().min(1, 'Le libellé est obligatoire'),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().int().min(0),
  vatRate: z.coerce.number().min(0).max(100),
  lineTotal: z.coerce.number().int().min(0).optional(),
  categoryHint: z.enum(lineCategoryHints).optional().nullable()
})

export const ticketInputSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  type: z.enum(ticketTypes),
  status: z.enum(ticketStatuses).default('new'),
  brand: optionalText,
  model: optionalText,
  serialNumber: optionalText,
  imei: optionalImei,
  accessCode: optionalText,
  simCode: optionalText,
  issueDescription: z.string().trim().min(3, 'La description du problème est obligatoire'),
  internalNotes: optionalText,
  openedAt: z.string().trim().min(1).default(() => new Date().toISOString()),
  closedAt: optionalText,
  lines: z.array(commercialLineInputSchema).default([])
})

export const documentLineInputSchema = commercialLineInputSchema

export const documentInputSchema = z.object({
  type: z.enum(documentTypes),
  status: z.enum(documentStatuses).default('issued'),
  customerId: z.coerce.number().int().positive(),
  ticketId: z.coerce.number().int().positive().optional().nullable(),
  issuedAt: z.string().trim().min(1).default(() => new Date().toISOString()),
  notes: optionalText,
  lines: z.array(commercialLineInputSchema).min(1, 'Au moins une ligne est obligatoire')
})

export const paymentInputSchema = z.object({
  customerId: z.coerce.number().int().positive().optional().nullable(),
  documentId: z.coerce.number().int().positive(),
  method: z.enum(paymentMethods),
  status: z.enum(paymentStatuses).default('paid'),
  amount: z.coerce.number().int().min(0),
  paidAt: z.string().trim().min(1).default(() => new Date().toISOString()),
  notes: optionalText
})

export const updateIdSchema = z.object({
  id: z.coerce.number().int().positive()
})

export const deleteManySchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1)
})

export const markDocumentPaidSchema = z.object({
  method: z.enum(paymentMethods),
  amount: z.coerce.number().int().min(0).optional(),
  paidAt: z.string().trim().min(1).default(() => new Date().toISOString()),
  notes: optionalText
})

export const documentEmailSchema = z.object({
  to: z.string().trim().email('Un e-mail valide est obligatoire'),
  subject: z.string().trim().min(1, 'L’objet est obligatoire'),
  message: z.string().trim().min(1, 'Le message est obligatoire')
})

export const wooCommerceImportSchema = z.object({
  orderRef: z.string().trim().min(1, 'Le numéro de commande est obligatoire')
})

export const ticketStatusUpdateSchema = z.object({
  status: z.enum(ticketStatuses),
  internalNotes: optionalText
})

export const employeeInputSchema = z.object({
  firstName: z.string().trim().min(1, 'Le prénom est obligatoire'),
  lastName: z.string().trim().min(1, 'Le nom est obligatoire'),
  email: optionalEmail,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide'),
  vacationDaysPerYear: z.coerce.number().int().min(0).max(365).default(25),
  isActive: z.coerce.boolean().default(true)
})

export const vacationEntryInputSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  type: z.enum(vacationEntryTypes).default('full_day'),
  status: z.enum(vacationEntryStatuses).default('pending'),
  notes: optionalText
}).refine(
  data => data.startDate <= data.endDate,
  { message: 'La date de fin doit être après la date de début', path: ['endDate'] }
).refine(
  data => data.type === 'full_day' || data.startDate === data.endDate,
  { message: 'Les demi-journées doivent avoir la même date de début et de fin', path: ['type'] }
)
