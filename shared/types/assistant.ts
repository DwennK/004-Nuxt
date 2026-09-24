export type AssistantChatRole = 'user' | 'assistant'

export interface AssistantChatMessageInput {
  id: string
  role: AssistantChatRole
  content: string
  context?: AssistantQueryContext[]
}

export type AssistantTableCell = string | number | boolean | null

export interface AssistantQueryTable {
  columns: string[]
  rows: Array<Record<string, AssistantTableCell>>
}

export interface AssistantQueryContext {
  summary: string
  rowCount: number
  truncated: boolean
  rows: Array<Record<string, AssistantTableCell>>
}

export interface AssistantQueryResult {
  summary: string
  explanation: string
  rowCount: number
  truncated: boolean
  table: AssistantQueryTable
  sql?: string
}

export interface AssistantChatError {
  code: 'sql_rejected' | 'sql_timeout' | 'sql_execution_failed' | 'service_unavailable'
  message: string
  retryable: boolean
}

export interface AssistantChatResponse {
  message: AssistantChatMessageInput
  query?: AssistantQueryResult
  queries?: AssistantQueryResult[]
  error?: AssistantChatError
}

export interface AssistantChatRequest {
  messages: AssistantChatMessageInput[]
  debug: boolean
}

export type AssistantStreamEvent
  = | { type: 'status', text: string }
    | { type: 'query-start', id: string, summary: string }
    | { type: 'query-result', id: string, query: AssistantQueryResult }
    | { type: 'query-error', id: string }
    | { type: 'text', text: string }
    | { type: 'finish', response: AssistantChatResponse }

export type AssistantStreamOptions = {
  signal?: AbortSignal
  emit?: (event: AssistantStreamEvent) => Promise<void>
}
