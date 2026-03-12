import * as z from 'zod'
import { createCustomer, deleteCustomers, listCustomers } from '../utils/customers'

const createCustomerSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  status: z.enum(['subscribed', 'unsubscribed', 'bounced']).optional(),
  location: z.string().min(2).optional()
})

const deleteCustomersSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1)
})

export default eventHandler(async (event) => {
  if (event.method === 'GET') {
    return listCustomers()
  }

  if (event.method === 'POST') {
    const body = await readValidatedBody(event, createCustomerSchema.parse)

    try {
      return await createCustomer(body)
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw createError({
          statusCode: 409,
          statusMessage: 'A customer with this email already exists'
        })
      }

      throw error
    }
  }

  if (event.method === 'DELETE') {
    const body = await readValidatedBody(event, deleteCustomersSchema.parse)
    const deleted = await deleteCustomers(body.ids)

    return { deleted }
  }

  throw createError({
    statusCode: 405,
    statusMessage: 'Method not allowed'
  })
})
