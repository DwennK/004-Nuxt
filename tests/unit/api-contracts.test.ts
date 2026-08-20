import { createApp, eventHandler, getValidatedQuery, toWebHandler } from 'h3'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PaginatedResponse, PaymentListItem, PaymentListResponse } from '../../shared/types/pos'
import {
  isoDateSchema,
  numericIdParamsSchema,
  paginationQuerySchema,
  queryBooleanSchema
} from '../../shared/validation/api'
import { paymentListQuerySchema } from '../../shared/validation/pos'

describe('API contract validation primitives', () => {
  it('coerces positive numeric route IDs', () => {
    expect(numericIdParamsSchema.parse({ id: '42' })).toEqual({ id: 42 })
    expect(numericIdParamsSchema.safeParse({ id: '0' }).success).toBe(false)
    expect(numericIdParamsSchema.safeParse({ id: '1.5' }).success).toBe(false)
  })

  it('parses explicit query booleans without treating "false" as truthy', () => {
    expect(queryBooleanSchema.parse('true')).toBe(true)
    expect(queryBooleanSchema.parse('false')).toBe(false)
    expect(queryBooleanSchema.parse(false)).toBe(false)
    expect(queryBooleanSchema.safeParse('0').success).toBe(false)
  })

  it('accepts real ISO calendar dates only', () => {
    expect(isoDateSchema.parse('2024-02-29')).toBe('2024-02-29')
    expect(isoDateSchema.safeParse('2026-02-29').success).toBe(false)
    expect(isoDateSchema.safeParse('20-08-2026').success).toBe(false)
  })

  it('applies bounded pagination defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 50
    })
    expect(paginationQuerySchema.parse({ page: '2', pageSize: '100' })).toEqual({
      page: 2,
      pageSize: 100
    })
    expect(paginationQuerySchema.safeParse({ pageSize: '251' }).success).toBe(false)
  })

  it('turns query validation failures into H3 HTTP 400 responses', async () => {
    const app = createApp()
    app.use(eventHandler(async (event) => {
      return getValidatedQuery(event, paginationQuerySchema.parse)
    }))

    const response = await toWebHandler(app)(new Request('http://localhost/?page=0'))
    const payload = await response.json() as { statusCode: number, statusMessage: string }

    expect(response.status).toBe(400)
    expect(payload.statusCode).toBe(400)
    expect(payload.statusMessage).toBe('Validation Error')
  })
})

describe('payment list contract', () => {
  it('applies pagination and sorting defaults to payment queries', () => {
    expect(paymentListQuerySchema.parse({ search: '  Dupont  ' })).toEqual({
      search: 'Dupont',
      page: 1,
      pageSize: 50,
      sortBy: 'paidAt',
      sortDirection: 'desc'
    })
  })

  it('rejects out-of-bounds pages and incoherent date ranges', () => {
    expect(paymentListQuerySchema.safeParse({ pageSize: '251' }).success).toBe(false)
    expect(paymentListQuerySchema.safeParse({
      dateFrom: '2026-08-20',
      dateTo: '2026-08-19'
    }).success).toBe(false)
  })

  it('uses the shared paginated response shape', () => {
    expectTypeOf<PaymentListResponse>().toEqualTypeOf<PaginatedResponse<PaymentListItem>>()

    const response = {
      items: [],
      page: 2,
      pageSize: 50,
      total: 51
    } satisfies PaymentListResponse

    expect(response).toEqual({
      items: [],
      page: 2,
      pageSize: 50,
      total: 51
    })
  })
})
