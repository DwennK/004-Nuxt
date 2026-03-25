import * as z from 'zod'
import { createCustomer, deleteCustomers, listCustomers, updateCustomer } from '../utils/customers'

const customerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  email: z.email(),
  address: z.string().min(2),
  postalCode: z.string().min(2),
  city: z.string().min(2),
  comment: z.string().optional().default('')
})

const updateCustomerSchema = customerSchema.extend({
  id: z.coerce.number().int().positive()
})

const deleteCustomersSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1)
})

export default eventHandler(async (event) => {
  if (event.method === 'GET') {
    return listCustomers()
  }

  if (event.method === 'POST') {
    const body = await readValidatedBody(event, customerSchema.parse)

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

  if (event.method === 'PATCH') {
    const body = await readValidatedBody(event, updateCustomerSchema.parse)

    try {
      return await updateCustomer(body)
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
