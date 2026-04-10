import type { AssistantChatMessageInput, AssistantChatResponse } from '~~/shared/types/assistant'
import { buildAssistantSchemaContext } from './allowlist'
import { requestOpenAITextResponse, requestStructuredOpenAIResponse } from './openai'
import {
  AssistantSqlValidationError,
  runReadOnlyQuery,
  validateAssistantSql
} from './sql'

type AssistantPlanningResult = {
  action: 'query' | 'reject'
  sql: string
  querySummary: string
  answerPlan: string
  rejectionReason: string
}

const planningSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: ['query', 'reject']
    },
    sql: {
      type: 'string'
    },
    querySummary: {
      type: 'string'
    },
    answerPlan: {
      type: 'string'
    },
    rejectionReason: {
      type: 'string'
    }
  },
  required: ['action', 'sql', 'querySummary', 'answerPlan', 'rejectionReason']
} as const

function buildConversationTranscript(messages: AssistantChatMessageInput[]) {
  return messages
    .slice(-10)
    .map(message => `${message.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${message.content}`)
    .join('\n')
}

function buildPlanningPrompt(messages: AssistantChatMessageInput[]) {
  const latestQuestion = [...messages].reverse().find(message => message.role === 'user')?.content || ''

  return [
    'Question la plus récente:',
    latestQuestion,
    '',
    'Historique utile:',
    buildConversationTranscript(messages)
  ].join('\n')
}

function buildPlanningSystemPrompt() {
  return [
    'Tu es un assistant analytique interne pour un tableau de bord POS/CRM.',
    'Tu dois soit préparer une requête SQL SQLite en lecture seule, soit refuser si la question ne peut pas être résolue de façon sûre avec les tables exposées.',
    'Réponds strictement avec le schéma JSON demandé.',
    'Contraintes SQL:',
    '- SQLite/Turso uniquement.',
    '- Lecture seule: SELECT ou WITH ... SELECT.',
    '- Pas de commentaire SQL.',
    '- Pas de SELECT *.',
    '- Toujours qualifier les colonnes avec un alias.',
    '- Utiliser uniquement les tables et colonnes exposées.',
    '- Préférer des agrégations courtes et lisibles pour répondre à une question métier.',
    '- Si la question demande des données privées, hors périmètre, ou ambiguës sans hypothèse sûre, retourne action="reject".',
    '',
    buildAssistantSchemaContext()
  ].join('\n')
}

function buildAnswerPrompt(options: {
  question: string
  querySummary: string
  answerPlan: string
  rows: Array<Record<string, string | number | boolean | null>>
  rowCount: number
  truncated: boolean
}) {
  return [
    'Question utilisateur:',
    options.question,
    '',
    'Résumé de la requête:',
    options.querySummary,
    '',
    'Plan de réponse:',
    options.answerPlan,
    '',
    `Nombre de lignes renvoyées: ${options.rowCount}`,
    `Résultat tronqué: ${options.truncated ? 'oui' : 'non'}`,
    '',
    'Lignes renvoyées (JSON):',
    JSON.stringify(options.rows)
  ].join('\n')
}

function buildAssistantMessage(content: string): AssistantChatResponse['message'] {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content
  }
}

export async function runAssistantChat(messages: AssistantChatMessageInput[], debug: boolean): Promise<AssistantChatResponse> {
  const requestId = crypto.randomUUID()
  const latestQuestion = [...messages].reverse().find(message => message.role === 'user')?.content || ''

  const planning = await requestStructuredOpenAIResponse<AssistantPlanningResult>({
    requestId,
    schemaName: 'assistant_query_plan',
    schema: planningSchema,
    systemPrompt: buildPlanningSystemPrompt(),
    userPrompt: buildPlanningPrompt(messages)
  })

  if (planning.action === 'reject' || !planning.sql.trim()) {
    return {
      message: buildAssistantMessage(
        planning.rejectionReason.trim()
          ? planning.rejectionReason.trim()
          : 'Je ne peux pas répondre de façon sûre avec les données exposées actuellement.'
      ),
      error: {
        code: 'model_refused',
        message: 'La question a été refusée par la couche de planification.',
        retryable: false
      }
    }
  }

  let validatedQuery

  try {
    validatedQuery = validateAssistantSql(planning.sql)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'La requête générée a été rejetée.'

    console.warn(JSON.stringify({
      scope: 'assistant-sql',
      requestId,
      accepted: false,
      sql: planning.sql,
      reason: message
    }))

    return {
      message: buildAssistantMessage(
        'Je n’ai pas pu interroger la base, car la requête générée n’a pas passé les garde-fous de lecture seule.'
      ),
      error: {
        code: 'sql_rejected',
        message,
        retryable: true
      }
    }
  }

  try {
    const result = await runReadOnlyQuery(validatedQuery, requestId)
    const explanation = await requestOpenAITextResponse({
      requestId,
      systemPrompt: [
        'Tu rédiges des réponses métier internes en français pour un tableau de bord POS/CRM.',
        'Sois concis, factuel et utile.',
        'Si le résultat est vide, dis-le clairement.',
        'N’invente aucun chiffre absent du résultat.',
        'Rappelle brièvement si les montants sont en CHF en convertissant les centimes en francs quand c’est évident.',
        'N’affiche pas de SQL.'
      ].join('\n'),
      userPrompt: buildAnswerPrompt({
        question: latestQuestion,
        querySummary: planning.querySummary,
        answerPlan: planning.answerPlan,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated
      })
    })

    return {
      message: buildAssistantMessage(explanation),
      query: {
        summary: planning.querySummary,
        explanation,
        rowCount: result.rowCount,
        truncated: result.truncated,
        table: {
          columns: result.columns,
          rows: result.rows
        },
        sql: debug ? validatedQuery.displaySql : undefined
      }
    }
  } catch (error) {
    const message = error instanceof AssistantSqlValidationError
      ? error.message
      : 'La requête validée n’a pas pu être exécutée.'

    return {
      message: buildAssistantMessage(
        message.includes('délai maximal')
          ? 'La requête a été arrêtée car elle dépassait le délai autorisé. Reformulez avec une période plus courte ou une question plus ciblée.'
          : 'Je n’ai pas pu exécuter la requête sur la base. Reformulez la question ou réduisez le périmètre demandé.'
      ),
      error: {
        code: message.includes('délai maximal') ? 'sql_timeout' : 'sql_execution_failed',
        message,
        retryable: true
      }
    }
  }
}
