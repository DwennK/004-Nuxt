import { describe, expect, it } from 'vitest'
import { buildAssistantHistory } from '../../shared/utils/assistant'
import { assistantChatRequestSchema } from '../../shared/validation/assistant'

describe('assistant conversation context', () => {
  it('keeps the latest question valid after a long conversation', () => {
    const messages = Array.from({ length: 100 }, (_, index) => ({ id: String(index), role: index % 2 ? 'user' as const : 'assistant' as const, content: 'x'.repeat(14000) }))
    const history = buildAssistantHistory(messages)
    expect(history.at(-1)?.id).toBe('99')
    expect(assistantChatRequestSchema.safeParse({ messages: history }).success).toBe(true)
    expect(messages).toHaveLength(100)
  })

  it('preserves bounded result samples, marks omitted rows and excludes failed answers', () => {
    const history = buildAssistantHistory([
      { id: 'failed', role: 'assistant', content: 'Error', includeInRequest: false },
      { id: 'answer', role: 'assistant', content: 'Résultats', queries: [{ summary: 'Tickets', explanation: '', rowCount: 20, truncated: false, table: { columns: ['id'], rows: Array.from({ length: 20 }, (_, id) => ({ id })) } }] },
      { id: 'question', role: 'user', content: 'Et le premier ?' }
    ])
    expect(history).toHaveLength(2)
    expect(history[0]?.context?.[0]).toMatchObject({ rowCount: 20, truncated: true, rows: [{ id: 0 }, { id: 1 }, { id: 2 }] })
    expect(assistantChatRequestSchema.safeParse({ messages: history }).success).toBe(true)
  })
})
