import { z } from 'zod'

export const assistantMessageSchema = z.object({
  id: z.string().trim().min(1).max(100),
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000)
})

export const assistantChatRequestSchema = z.object({
  messages: z.array(assistantMessageSchema).min(1).max(24),
  debug: z.coerce.boolean().optional().default(false)
})

export const assistantChatResponseSchema = z.object({
  message: assistantMessageSchema,
  query: z.object({
    summary: z.string(),
    explanation: z.string(),
    rowCount: z.number().int().min(0),
    truncated: z.boolean(),
    table: z.object({
      columns: z.array(z.string()),
      rows: z.array(z.record(z.string(), z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null()
      ])))
    }),
    sql: z.string().optional()
  }).optional(),
  error: z.object({
    code: z.enum(['sql_rejected', 'sql_timeout', 'sql_execution_failed']),
    message: z.string(),
    retryable: z.boolean()
  }).optional()
})
