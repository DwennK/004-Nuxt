import type { AssistantChatMessageInput, AssistantQueryResult } from '../types/assistant'

export const ASSISTANT_MAX_MESSAGES = 32
export const ASSISTANT_MAX_MESSAGE_LENGTH = 12000
export const ASSISTANT_MAX_HISTORY_CHARACTERS = 100000

// Keep the visible conversation intact; bound only the context sent to the server.
export function buildAssistantHistory(messages: Array<AssistantChatMessageInput & {
  includeInRequest?: boolean
  queries?: AssistantQueryResult[]
  query?: AssistantQueryResult
}>) {
  const history: AssistantChatMessageInput[] = messages
    .filter(message => message.includeInRequest !== false)
    .slice(-ASSISTANT_MAX_MESSAGES)
    .map((message, index, recent) => ({
      id: message.id,
      role: message.role,
      content: message.content.slice(0, ASSISTANT_MAX_MESSAGE_LENGTH),
      context: message.role === 'assistant' && index >= recent.length - 8
        ? (message.queries || (message.query ? [message.query] : [])).slice(-4).map(query => ({
            summary: query.summary.slice(0, 1000),
            rowCount: query.rowCount,
            truncated: query.truncated || query.table.rows.length > 3,
            rows: query.table.rows.slice(0, 3).map(row => Object.fromEntries(
              Object.entries(row).slice(0, 20).map(([key, value]) => [
                key.slice(0, 100), typeof value === 'string' ? value.slice(0, 300) : value
              ])
            ))
          }))
        : undefined
    }))

  while (history.length > 1 && JSON.stringify(history).length > ASSISTANT_MAX_HISTORY_CHARACTERS) {
    history.shift()
  }
  return history
}
