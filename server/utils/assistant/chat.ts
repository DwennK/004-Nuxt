import type { AssistantChatMessageInput, AssistantChatResponse } from '~~/shared/types/assistant'
import { buildAssistantSchemaContext } from './allowlist'
import { requestStructuredResponse, requestTextResponse } from './provider'
import {
  AssistantSqlValidationError,
  runReadOnlyQuery,
  validateAssistantSql
} from './sql'

type AssistantPlanningResult = {
  sql: string
  querySummary: string
  answerPlan: string
}

const planningSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sql: {
      type: 'string',
      minLength: 10,
      description: 'Requête SQLite SELECT complète, jamais vide.'
    },
    querySummary: {
      type: 'string',
      minLength: 1
    },
    answerPlan: {
      type: 'string',
      minLength: 1
    }
  },
  required: ['sql', 'querySummary', 'answerPlan']
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
    'Ta seule tâche: traduire la question en UNE requête SQL SQLite SELECT en lecture seule. Tu ne dois JAMAIS renvoyer une sql vide.',
    'Les garde-fous de sécurité (lecture seule, allowlist tables/colonnes, colonnes sensibles bloquées) sont déjà appliqués en aval. Ta réponse n’est PAS ce qui protège la base — contente-toi de produire la meilleure requête possible.',
    'Réponds strictement avec le schéma JSON demandé. Les trois champs sql, querySummary, answerPlan doivent être non vides.',
    'Contraintes SQL:',
    '- SQLite/Turso uniquement.',
    '- Lecture seule: SELECT ou WITH ... SELECT.',
    '- Pas de commentaire SQL, pas de point-virgule final.',
    '- Pas de SELECT *. Liste les colonnes explicitement.',
    '- Toujours qualifier les colonnes avec le nom de table ou un alias.',
    '- Utiliser uniquement les tables et colonnes exposées ci-dessous.',
    '- Préférer des agrégations courtes et lisibles pour répondre à une question métier.',
    '- Si la question est ambiguë, pose l’hypothèse la plus raisonnable et produis la requête. Explique l’hypothèse dans querySummary.',
    '- Si la question semble hors périmètre, produis quand même un SELECT plausible sur les tables exposées (ex: SELECT c.id, c.first_name, c.last_name FROM customers c LIMIT 5) et signale le désalignement dans querySummary.',
    '',
    'Exemple pour "Quels sont les 10 derniers paiements encaissés ?":',
    '{"sql":"SELECT p.id, p.customer_id, p.document_id, p.method, p.amount, p.paid_at FROM payments p WHERE p.status = \'paid\' ORDER BY p.paid_at DESC LIMIT 10","querySummary":"10 derniers paiements avec statut paid, triés par date de paiement.","answerPlan":"Lister la date, le mode, le montant et le document associé."}',
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

function normalizePlanningResult(planning: Partial<AssistantPlanningResult>) {
  return {
    sql: typeof planning.sql === 'string' ? planning.sql.trim() : '',
    querySummary: typeof planning.querySummary === 'string' ? planning.querySummary.trim() : '',
    answerPlan: typeof planning.answerPlan === 'string' ? planning.answerPlan.trim() : ''
  } satisfies AssistantPlanningResult
}

export async function runAssistantChat(messages: AssistantChatMessageInput[], debug: boolean): Promise<AssistantChatResponse> {
  const requestId = crypto.randomUUID()
  const latestQuestion = [...messages].reverse().find(message => message.role === 'user')?.content || ''

  const rawPlanning = await requestStructuredResponse<Partial<AssistantPlanningResult>>({
    requestId,
    schemaName: 'assistant_query_plan',
    schema: planningSchema,
    systemPrompt: buildPlanningSystemPrompt(),
    userPrompt: buildPlanningPrompt(messages)
  })
  const planning = normalizePlanningResult(rawPlanning)

  if (!planning.sql) {
    console.warn(JSON.stringify({
      scope: 'assistant-planning',
      requestId,
      reason: 'empty-sql',
      rawPlanning
    }))

    return {
      message: buildAssistantMessage(
        'La couche de planification n’a pas produit de requête SQL. Reformulez la question.'
      ),
      error: {
        code: 'sql_rejected',
        message: 'Aucune requête SQL générée.',
        retryable: true
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
    const explanation = await requestTextResponse({
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
