import { z } from 'zod'
import {
  catalogItemTypes,
  documentStatuses,
  documentTypes,
  lineCategoryHints,
  paymentMethods,
  paymentStatuses,
  ticketStatuses,
  ticketTypes
} from '../constants/pos'

const optionalText = z.string().trim().optional().nullable().transform((value) => {
  if (!value) {
    return null
  }

  return value.trim() || null
})

export const customerInputSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  companyName: optionalText,
  phone: z.string().trim().min(3, 'Phone is required'),
  email: z.email('Valid email is required'),
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: optionalText,
  city: optionalText,
  notes: optionalText
})

export const catalogItemInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  sku: optionalText,
  type: z.enum(catalogItemTypes),
  defaultPrice: z.coerce.number().int().min(0),
  vatRate: z.coerce.number().min(0).max(100),
  isActive: z.coerce.boolean().default(true)
})

export const ticketInputSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  type: z.enum(ticketTypes),
  status: z.enum(ticketStatuses).default('new'),
  brand: optionalText,
  model: optionalText,
  serialNumber: optionalText,
  imei: optionalText,
  issueDescription: z.string().trim().min(3, 'Issue description is required'),
  internalNotes: optionalText,
  openedAt: z.string().trim().min(1).default(() => new Date().toISOString()),
  closedAt: optionalText
})

export const documentLineInputSchema = z.object({
  catalogItemId: z.coerce.number().int().positive().optional().nullable(),
  label: z.string().trim().min(1, 'Label is required'),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().int().min(0),
  vatRate: z.coerce.number().min(0).max(100),
  lineTotal: z.coerce.number().int().min(0).optional(),
  categoryHint: z.enum(lineCategoryHints).optional().nullable()
})

export const documentInputSchema = z.object({
  type: z.enum(documentTypes),
  status: z.enum(documentStatuses).default('issued'),
  customerId: z.coerce.number().int().positive(),
  ticketId: z.coerce.number().int().positive().optional().nullable(),
  issuedAt: z.string().trim().min(1).default(() => new Date().toISOString()),
  notes: optionalText,
  lines: z.array(documentLineInputSchema).min(1, 'At least one line is required')
})

export const paymentInputSchema = z.object({
  customerId: z.coerce.number().int().positive().optional().nullable(),
  documentId: z.coerce.number().int().positive(),
  method: z.enum(paymentMethods),
  status: z.enum(paymentStatuses).default('paid'),
  amount: z.coerce.number().int().min(0),
  paidAt: z.string().trim().min(1).default(() => new Date().toISOString()),
  reference: optionalText,
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
  reference: optionalText,
  notes: optionalText
})

export const ticketStatusUpdateSchema = z.object({
  status: z.enum(ticketStatuses),
  internalNotes: optionalText
})
