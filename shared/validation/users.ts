import { z } from 'zod'

export const userEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email invalide')

export const userNameSchema = z
  .string()
  .trim()
  .min(1, 'Nom requis')
  .max(120, 'Nom trop long')

export const userPasswordSchema = z
  .string()
  .min(8, 'Mot de passe: 8 caractères minimum')
  .max(200, 'Mot de passe trop long')

export const createUserSchema = z.object({
  email: userEmailSchema,
  name: userNameSchema,
  password: userPasswordSchema
})

export const updateUserSchema = z.object({
  email: userEmailSchema.optional(),
  name: userNameSchema.optional(),
  isActive: z.boolean().optional()
}).refine(
  value => Object.keys(value).length > 0,
  { message: 'Aucune modification fournie' }
)

export const changePasswordSchema = z.object({
  password: userPasswordSchema
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
