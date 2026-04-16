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

const messages = ref<AssistantUiMessage[]>([])

const pending = computed(() => status.value === 'submitted')
const hasConversation = computed(() => messages.value.length > 0)
const greeting = computed(() => {
  const hour = new Date().getHours()

  if (hour < 12) {
    return 'Bonjour'
  }

  if (hour < 18) {
    return 'Bon après-midi'
  }

  return 'Bonsoir'
})

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

      <UDashboardToolbar v-if="hasConversation">
        <p class="text-sm text-toned">
          Questions ad hoc sur ventes, tickets, documents, paiements, stock, réservations et RH. Les colonnes sensibles restent exclues.
        </p>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col bg-default">
        <template v-if="!hasConversation">
          <div class="flex flex-1 min-h-0 overflow-auto">
            <UContainer class="flex flex-1 flex-col justify-center gap-4 py-8 sm:gap-6">
              <UAlert
                v-if="requestError"
                color="error"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                title="Dernière tentative en erreur"
                :description="requestError"
              />

              <div class="mx-auto w-full max-w-3xl">
                <h2 class="text-3xl font-bold text-highlighted sm:text-4xl">
                  {{ greeting }}
                </h2>

                <p class="mt-3 max-w-2xl text-base leading-7 text-toned">
                  Posez votre question.
                </p>
              </div>

              <div class="mx-auto w-full max-w-3xl">
                <UChatPrompt
                  v-model="prompt"
                  class="[view-transition-name:chat-prompt]"
                  variant="subtle"
                  :disabled="pending"
                  :ui="{
                    root: 'rounded-3xl border border-default/70 bg-default shadow-sm',
                    body: 'px-4 pt-4 pb-3',
                    base: 'min-h-[4.25rem] px-1.5 text-base placeholder:text-muted',
                    footer: 'border-t border-default/60 px-4 py-3'
                  }"
                  @submit.prevent="submitPrompt"
                >
                  <template #footer>
                    <div class="flex items-center gap-2 text-sm text-toned">
                      <UIcon name="i-lucide-sparkles" class="size-4" />
                      <span>Lecture seule SQL</span>
                    </div>

                    <UChatPromptSubmit color="neutral" size="sm" :loading="pending" />
                  </template>
                </UChatPrompt>
              </div>

              <div class="mx-auto flex w-full max-w-3xl flex-wrap gap-2">
                <UButton
                  v-for="suggestion in suggestionPrompts"
                  :key="suggestion"
                  variant="outline"
                  color="neutral"
                  size="sm"
                  class="rounded-full"
                  @click="usePromptSuggestion(suggestion)"
                >
                  {{ suggestion }}
                </UButton>
              </div>
            </UContainer>
          </div>
        </template>

        <template v-else>
          <UAlert
            v-if="requestError"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            class="mb-3"
            :title="status === 'error' ? 'Dernière tentative en erreur' : 'Information'"
            :description="requestError"
          />

          <UChatMessages
            :status="status"
            should-auto-scroll
            class="min-h-0 flex-1"
            :ui="{
              viewport: 'min-h-0 px-0 pb-6',
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
        </template>
      </div>
    </template>

    <template v-if="hasConversation" #footer>
      <div class="shrink-0 border-t border-default bg-default px-4 pt-3 pb-4 sm:px-6">
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
            </div>
          </template>

          <UChatPromptSubmit color="primary" :loading="pending" />
        </UChatPrompt>
      </div>
    </template>
  </UDashboardPanel>
</template>
