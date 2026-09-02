import type { H3Event } from 'h3'
import { isError } from 'h3'
import { z } from 'zod'
import type { AssistantChatMessageInput, AssistantChatResponse } from '~~/shared/types/assistant'
import { buildAssistantSchemaContext } from './allowlist'
import { requestStructuredResponse, requestTextResponse } from './provider'
import {
  ASSISTANT_ALLOWED_SQL_FUNCTIONS,
  AssistantSqlValidationError,
  runReadOnlyQuery,
  validateAssistantSql
} from './sql'

const planningResultSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('query'),
    sql: z.string().trim().min(10),
    querySummary: z.string().trim().min(1),
    answerPlan: z.string().trim().min(1),
    response: z.literal('')
  }),
  z.strictObject({
    action: z.enum(['clarify', 'out_of_scope']),
    sql: z.literal(''),
    querySummary: z.literal(''),
    answerPlan: z.literal(''),
    response: z.string().trim().min(1).max(2000)
  })
])

const planningSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: ['query', 'clarify', 'out_of_scope'],
      description: 'query pour une demande métier précise ; clarify si une précision manque ; out_of_scope hors du périmètre POS.'
    },
    sql: {
      type: 'string',
      description: 'Requête SQLite SELECT uniquement pour action=query. Chaîne vide sinon.'
    },
    querySummary: {
      type: 'string',
      description: 'Résumé de la requête pour action=query. Chaîne vide sinon.'
    },
    answerPlan: {
      type: 'string',
      description: 'Plan de réponse pour action=query. Chaîne vide sinon.'
    },
    response: {
      type: 'string',
      description: 'Réponse brève en français pour clarify ou out_of_scope. Chaîne vide pour query.'
    }
  },
  required: ['action', 'sql', 'querySummary', 'answerPlan', 'response']
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
    'Détermine d’abord si la demande nécessite une consultation pertinente des données autorisées, en tenant compte de l’historique.',
    'Réponds strictement avec le schéma JSON demandé et choisis une action :',
    '- query : la demande métier est assez précise pour produire UNE requête SQL SQLite SELECT en lecture seule. Renseigne sql, querySummary et answerPlan ; laisse response vide.',
    '- clarify : salutation, test, ping, demande vague ou précision essentielle manquante. Pose une courte question utile dans response ; laisse sql, querySummary et answerPlan vides.',
    '- out_of_scope : demande étrangère au POS, écriture de données ou accès non autorisé. Explique brièvement la limite et invite à une question métier en lecture seule dans response ; laisse les trois champs SQL vides.',
    'Ne consulte jamais des clients, paiements ou autres données pour tester la connexion ou remplir une réponse hors sujet.',
    'N’invente pas de période, de mesure ou d’objet métier manquant. Utilise les précisions déjà fournies dans l’historique, notamment pour une question de suivi.',
    'Pour clarify et out_of_scope, ne prétends pas avoir interrogé ou vérifié la base et ne réponds pas au sujet extérieur au POS.',
    'Contraintes SQL:',
    '- SQLite/Turso uniquement.',
    '- Lecture seule: SELECT ou WITH ... SELECT.',
    '- Pas de commentaire SQL, pas de point-virgule final.',
    '- Pas de SELECT *. Liste les colonnes explicitement.',
    '- Toujours qualifier les colonnes avec le nom de table ou un alias.',
    '- Utiliser uniquement les tables et colonnes exposées ci-dessous.',
    `- Utiliser uniquement ces fonctions SQL: ${ASSISTANT_ALLOWED_SQL_FUNCTIONS.join(', ')}.`,
    '- Préférer des agrégations courtes et lisibles pour répondre à une question métier.',
    '',
    'Exemple pour "test" :',
    '{"action":"clarify","sql":"","querySummary":"","answerPlan":"","response":"Bonjour ! Quelle information souhaitez-vous consulter : ventes, tickets, paiements ou stock ?"}',
    'Exemple pour "Quel total ?" sans historique utile :',
    '{"action":"clarify","sql":"","querySummary":"","answerPlan":"","response":"Quel total souhaitez-vous connaître, et sur quelle période ?"}',
    'Exemple pour "Quel temps fera-t-il demain ?" :',
    '{"action":"out_of_scope","sql":"","querySummary":"","answerPlan":"","response":"Je peux vous aider à consulter les données du magasin. Souhaitez-vous une information sur les ventes, les tickets ou le stock ?"}',
    '',
    'Exemple pour "Quels sont les 10 derniers paiements encaissés ?":',
    '{"action":"query","sql":"SELECT p.id, p.customer_id, p.document_id, p.method, p.amount, p.paid_at FROM payments p WHERE p.status = \'paid\' ORDER BY p.paid_at DESC LIMIT 10","querySummary":"10 derniers paiements avec statut paid, triés par date de paiement.","answerPlan":"Lister la date, le mode, le montant et le document associé.","response":""}',
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

function buildProviderErrorResponse(error: unknown, requestId: string): AssistantChatResponse {
  const providerError = isError(error) ? error : undefined
  const data = providerError?.data
  const notConfigured = data && typeof data === 'object' && 'code' in data && data.code === 'assistant_not_configured'
  const message = notConfigured
    ? 'L’assistant IA n’est pas configuré sur le serveur. Contactez un administrateur.'
    : 'Le service IA est temporairement indisponible. Réessayez dans quelques instants.'

  console.warn(JSON.stringify({
    scope: 'assistant-provider',
    requestId,
    reason: notConfigured ? 'not_configured' : 'unavailable',
    statusCode: providerError?.statusCode
  }))

  return {
    message: buildAssistantMessage(message),
    error: { code: 'service_unavailable', message, retryable: !notConfigured }
  }
}

export async function runAssistantChat(
  event: H3Event,
  messages: AssistantChatMessageInput[],
  debug: boolean,
  requestId: string = crypto.randomUUID()
): Promise<AssistantChatResponse> {
  const latestQuestion = [...messages].reverse().find(message => message.role === 'user')?.content || ''

  let rawPlanning
  try {
    rawPlanning = await requestStructuredResponse<unknown>(event, {
      requestId,
      schemaName: 'assistant_query_plan',
      schema: planningSchema,
      systemPrompt: buildPlanningSystemPrompt(),
      userPrompt: buildPlanningPrompt(messages)
    })
  } catch (error) {
    return buildProviderErrorResponse(error, requestId)
  }
  const parsedPlanning = planningResultSchema.safeParse(rawPlanning)

  if (!parsedPlanning.success) {
    console.warn(JSON.stringify({
      scope: 'assistant-planning',
      requestId,
      reason: 'invalid-plan'
    }))

    return {
      message: buildAssistantMessage(
        'Je n’ai pas pu préparer une réponse à cette demande. Réessayez ou précisez votre question.'
      ),
      error: {
        code: 'service_unavailable',
        message: 'La réponse du service IA est invalide.',
        retryable: true
      }
    }
  }

  const planning = parsedPlanning.data

  if (planning.action !== 'query') {
    return { message: buildAssistantMessage(planning.response) }
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
      candidateCharacters: planning.sql.length,
      reason: error instanceof AssistantSqlValidationError ? error.code : 'invalid_query'
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
    let explanation
    try {
      explanation = await requestTextResponse(event, {
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
    } catch (error) {
      return buildProviderErrorResponse(error, requestId)
    }

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
