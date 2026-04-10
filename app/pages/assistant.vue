<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  AssistantChatError,
  AssistantChatMessageInput,
  AssistantChatResponse,
  AssistantQueryResult,
  AssistantTableCell
} from '~~/shared/types/assistant'

type ChatStatus = 'submitted' | 'ready' | 'error'
type ChatRow = Record<string, AssistantTableCell>

type AssistantUiMessage = AssistantChatMessageInput & {
  query?: AssistantQueryResult
  error?: AssistantChatError
  includeInRequest?: boolean
}

const prompt = ref('')
const debug = ref(false)
const status = ref<ChatStatus>('ready')
const requestError = ref<string | null>(null)

const suggestionPrompts = [
  'Quels sont les 10 derniers paiements encaissés ?',
  'Quel chiffre d’affaires avons-nous par type de document ce mois-ci ?',
  'Combien de tickets sont encore ouverts par statut ?',
  'Quel est l’état des demandes de réservation smartphone ?'
]

const messages = ref<AssistantUiMessage[]>([{
  id: 'assistant-welcome',
  role: 'assistant',
  content: 'Posez une question métier libre. Je réponds uniquement à partir des tables exposées et en lecture seule.',
  includeInRequest: false
}])

const pending = computed(() => status.value === 'submitted')

function createParts(content: string) {
  return [{
    id: crypto.randomUUID(),
    type: 'text',
    text: content
  }] as const
}

function buildRequestMessages() {
  return messages.value
    .filter(message => message.includeInRequest !== false)
    .map(({ id, role, content }) => ({ id, role, content }))
}

function formatCellValue(value: AssistantTableCell) {
  if (value === null || value === undefined) {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'Oui' : 'Non'
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? new Intl.NumberFormat('fr-CH').format(value) : String(value)
  }

  return value
}

function buildTableColumns(columns: string[]): TableColumn<ChatRow>[] {
  return columns.map((column) => {
    return {
      accessorKey: column,
      header: column.replaceAll('_', ' '),
      cell: ({ row }) => h('span', {
        class: 'block truncate text-sm text-default'
      }, formatCellValue(row.original[column] ?? null))
    }
  })
}

function usePromptSuggestion(text: string) {
  prompt.value = text
}

async function submitPrompt() {
  const value = prompt.value.trim()

  if (!value || pending.value) {
    return
  }

  requestError.value = null
  status.value = 'submitted'

  const userMessage: AssistantUiMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: value,
    includeInRequest: true
  }

  messages.value.push(userMessage)
  prompt.value = ''

  try {
    const response = await $fetch<AssistantChatResponse>('/api/assistant/chat', {
      method: 'POST',
      body: {
        messages: buildRequestMessages(),
        debug: debug.value
      }
    })

    messages.value.push({
      ...response.message,
      query: response.query,
      error: response.error,
      includeInRequest: true
    })

    status.value = response.error ? 'error' : 'ready'
    requestError.value = response.error?.message || null
  } catch (error) {
    status.value = 'error'
    requestError.value = error instanceof Error
      ? error.message
      : 'Impossible de contacter le service assistant.'

    messages.value.push({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Le service assistant n’a pas répondu correctement. Vérifiez la configuration serveur puis réessayez.',
      error: {
        code: 'sql_execution_failed',
        message: requestError.value,
        retryable: true
      },
      includeInRequest: true
    })
  }
}
</script>

<template>
  <UDashboardPanel id="assistant">
    <template #header>
      <UDashboardNavbar title="Assistant IA">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #trailing>
          <div class="flex items-center gap-3">
            <UBadge color="success" variant="subtle">
              Lecture seule
            </UBadge>

            <div class="hidden items-center gap-2 sm:flex">
              <span class="text-xs text-toned">SQL debug</span>
              <USwitch v-model="debug" size="sm" />
            </div>
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <p class="text-sm text-toned">
          Questions ad hoc sur ventes, tickets, documents, paiements, stock, réservations et RH. Les colonnes sensibles restent exclues.
        </p>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col">
        <UAlert
          v-if="requestError"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          class="mb-3"
          :title="status === 'error' ? 'Dernière tentative en erreur' : 'Information'"
          :description="requestError"
        />

        <div v-if="messages.length === 1" class="mb-4 flex flex-wrap gap-2">
          <UButton
            v-for="suggestion in suggestionPrompts"
            :key="suggestion"
            variant="outline"
            color="neutral"
            size="xs"
            @click="usePromptSuggestion(suggestion)"
          >
            {{ suggestion }}
          </UButton>
        </div>

        <UChatMessages
          :status="status"
          should-auto-scroll
          class="min-h-0 flex-1"
          :ui="{
            viewport: 'min-h-0 px-0 pb-4',
            root: 'min-h-0 flex-1'
          }"
        >
          <UChatMessage
            v-for="message in messages"
            :id="message.id"
            :key="message.id"
            :role="message.role"
            :parts="createParts(message.content)"
            :side="message.role === 'user' ? 'right' : 'left'"
            :variant="message.role === 'user' ? 'soft' : 'naked'"
            :avatar="message.role === 'assistant' ? { icon: 'i-lucide-sparkles' } : undefined"
            :icon="message.role === 'user' ? 'i-lucide-user-round' : undefined"
          >
            <template #content>
              <div class="space-y-3">
                <p class="whitespace-pre-wrap text-sm leading-6 text-default">
                  {{ message.content }}
                </p>

                <UAlert
                  v-if="message.error"
                  color="error"
                  variant="subtle"
                  icon="i-lucide-shield-alert"
                  title="Réponse contrainte par les garde-fous"
                  :description="message.error.message"
                />

                <UChatTool
                  v-if="message.query"
                  variant="card"
                  icon="i-lucide-database"
                  text="Base interrogée"
                  :suffix="`${message.query.rowCount} ligne(s)`"
                  :default-open="debug"
                >
                  <div class="space-y-3">
                    <p class="text-sm text-toned">
                      {{ message.query.summary }}
                    </p>

                    <UBadge
                      v-if="message.query.truncated"
                      color="warning"
                      variant="subtle"
                    >
                      Résultat tronqué à 50 lignes
                    </UBadge>

                    <div
                      v-if="message.query.sql"
                      class="overflow-x-auto rounded-xl border border-default bg-elevated/60 p-3"
                    >
                      <pre class="text-xs leading-5 text-toned">{{ message.query.sql }}</pre>
                    </div>

                    <div
                      v-if="message.query.table.rows.length"
                      class="overflow-hidden rounded-2xl border border-default"
                    >
                      <UTable
                        :data="message.query.table.rows"
                        :columns="buildTableColumns(message.query.table.columns)"
                        :ui="{
                          base: 'table-fixed border-separate border-spacing-0',
                          th: 'py-2 border-b border-default bg-elevated/60 text-[11px] uppercase tracking-[0.14em] text-toned',
                          td: 'align-top border-b border-default last:border-b-0',
                          tbody: '[&>tr]:last:[&>td]:border-b-0'
                        }"
                      />
                    </div>

                    <p v-else class="text-sm text-toned">
                      Aucun enregistrement n’a été renvoyé pour cette question.
                    </p>
                  </div>
                </UChatTool>
              </div>
            </template>
          </UChatMessage>

          <UChatMessage
            v-if="pending"
            id="assistant-loading"
            role="assistant"
            :parts="createParts('Interrogation en cours')"
            :avatar="{ icon: 'i-lucide-sparkles' }"
          >
            <template #content>
              <UChatTool
                icon="i-lucide-database-zap"
                text="Interrogation de la base"
                loading
                streaming
              />
            </template>
          </UChatMessage>
        </UChatMessages>

        <div class="sticky bottom-0 mt-3 border-t border-default bg-default/95 pt-3 backdrop-blur">
          <UChatPrompt
            v-model="prompt"
            placeholder="Ex. Quel total encaissé par mode de paiement cette semaine ?"
            :disabled="pending"
            @submit.prevent="submitPrompt"
          >
            <template #footer>
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 sm:hidden">
                  <span class="text-xs text-toned">SQL debug</span>
                  <USwitch v-model="debug" size="sm" />
                </div>

                <span class="ml-auto text-xs text-toned">
                  1 capacité: SQL lecture seule sous garde-fous
                </span>
              </div>
            </template>

            <UChatPromptSubmit color="primary" :loading="pending" />
          </UChatPrompt>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
