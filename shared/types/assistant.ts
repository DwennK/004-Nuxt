export type AssistantChatRole = 'user' | 'assistant'

export interface AssistantChatMessageInput {
  id: string
  role: AssistantChatRole
  content: string
}

export type AssistantTableCell = string | number | boolean | null

export interface AssistantQueryTable {
  columns: string[]
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
  code: 'sql_rejected' | 'sql_timeout' | 'sql_execution_failed'
  message: string
  retryable: boolean
}

export interface AssistantChatResponse {
  message: AssistantChatMessageInput
  query?: AssistantQueryResult
  error?: AssistantChatError
}

export interface AssistantChatRequest {
  messages: AssistantChatMessageInput[]
  debug: boolean
}
