import { z } from 'zod'
import { ASSISTANT_MAX_HISTORY_CHARACTERS, ASSISTANT_MAX_MESSAGE_LENGTH, ASSISTANT_MAX_MESSAGES } from '../utils/assistant'

const assistantContextSchema = z.object({
  summary: z.string().max(1000),
  rowCount: z.number().int().min(0).max(50),
  truncated: z.boolean(),
  rows: z.array(z.record(z.string().max(100), z.union([
    z.string().max(300), z.number(), z.boolean(), z.null()
  ])).refine(row => Object.keys(row).length <= 20)).max(3)
})

export const assistantMessageSchema = z.object({
  id: z.string().trim().min(1).max(100),
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(ASSISTANT_MAX_MESSAGE_LENGTH),
  context: z.array(assistantContextSchema).max(4).optional()
})

export const assistantChatRequestSchema = z.object({
  messages: z.array(assistantMessageSchema).min(1).max(ASSISTANT_MAX_MESSAGES)
    .refine(messages => JSON.stringify(messages).length <= ASSISTANT_MAX_HISTORY_CHARACTERS),
  debug: z.coerce.boolean().optional().default(false)
})

const assistantQueryResultSchema = z.object({
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
})

export const assistantChatResponseSchema = z.object({
  message: assistantMessageSchema,
  query: assistantQueryResultSchema.optional(),
  queries: z.array(assistantQueryResultSchema).max(4).optional(),
  error: z.object({
    code: z.enum(['sql_rejected', 'sql_timeout', 'sql_execution_failed', 'service_unavailable']),
    message: z.string(),
    retryable: z.boolean()
  }).optional()
})
