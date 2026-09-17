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
  { icon: 'i-lucide-receipt', label: 'Factures du jour', prompt: 'Quelle est la plus grosse facture du jour ?' },
  { icon: 'i-lucide-wallet', label: 'Encaissements', prompt: 'Quel total encaissé par mode de paiement cette semaine ?' },
  { icon: 'i-lucide-wrench', label: 'Dossiers ouverts', prompt: 'Combien de dossiers sont encore ouverts par statut ?' },
  { icon: 'i-lucide-smartphone', label: 'Réservations', prompt: 'Quel est l’état des demandes de réservation smartphone ?' }
]

const messages = ref<AssistantUiMessage[]>([])
const conversation = useTemplateRef('conversation')
const composer = useTemplateRef('composer')
const pending = computed(() => status.value === 'submitted')
const hasConversation = computed(() => messages.value.length > 0)

watch([() => messages.value.length, pending], async () => {
  const element = conversation.value
  const followResponse = !element || element.scrollHeight - element.scrollTop - element.clientHeight < 120

  await nextTick()

  if (conversation.value && (pending.value || followResponse)) {
    conversation.value.scrollTo({ top: conversation.value.scrollHeight })
  }
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
        class: 'block max-w-80 whitespace-normal break-words text-sm text-default'
      }, formatCellValue(row.original[column] ?? null))
    }
  })
}

function usePromptSuggestion(text: string) {
  prompt.value = text
  composer.value?.textareaRef?.focus()
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
      includeInRequest: !response.error
    })

    status.value = response.error ? 'error' : 'ready'
    requestError.value = response.error?.message || null
  } catch {
    status.value = 'error'
    requestError.value = 'Impossible de contacter le service assistant. Réessayez dans quelques instants.'

    messages.value.push({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Le service assistant n’a pas répondu correctement. Vérifiez la configuration serveur puis réessayez.',
      error: {
        code: 'service_unavailable',
        message: requestError.value,
        retryable: true
      },
      includeInRequest: false
    })
  }
}
</script>

<template>
  <UDashboardPanel
    id="assistant"
    :ui="{ root: 'h-dvh min-h-0 bg-default', body: 'min-h-0 gap-0 overflow-hidden p-0 sm:p-0' }"
  >
    <template #header>
      <UDashboardNavbar title="Assistant IA">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <span class="inline-flex items-center gap-2 rounded-md bg-white/15 px-2.5 py-1.5 text-xs font-medium text-white ring-1 ring-inset ring-white/25">
            <UIcon name="i-lucide-shield-check" class="size-4" />
            Lecture seule
          </span>
        </template>
      </UDashboardNavbar>

      <div class="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-muted bg-default px-4 py-2.5 sm:px-6">
        <p class="text-xs text-muted sm:text-sm">
          Vos données de gestion, en conversation.
        </p>
        <USwitch
          v-model="debug"
          size="sm"
          label="Détails SQL"
          :disabled="pending"
        />
      </div>
    </template>

    <template #body>
      <div ref="conversation" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div v-if="!hasConversation" class="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center px-5 py-10 sm:px-10 sm:py-14">
          <div class="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UIcon name="i-lucide-sparkles" class="size-6" />
          </div>
          <h2 class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
            Que souhaitez-vous savoir ?
          </h2>
          <p class="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">
            Retrouvez une facture, faites le point sur vos encaissements ou suivez les dossiers en cours.
          </p>
          <div class="mt-8 border-t border-muted pt-5">
            <p class="mb-3 text-xs font-medium text-muted">
              Pour commencer
            </p>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <UButton
                v-for="suggestion in suggestionPrompts"
                :key="suggestion.label"
                :icon="suggestion.icon"
                trailing-icon="i-lucide-arrow-up-right"
                variant="ghost"
                color="neutral"
                :label="suggestion.label"
                class="justify-start rounded-lg bg-muted/60 px-3 py-3 transition-colors motion-reduce:transition-none"
                :ui="{ leadingIcon: 'text-primary', trailingIcon: 'ms-auto size-4 text-muted' }"
                @click="usePromptSuggestion(suggestion.prompt)"
              />
            </div>
          </div>
        </div>

        <UChatMessages
          v-else
          :status="status"
          :should-scroll-to-bottom="false"
          :auto-scroll="{ label: 'Derniers messages', color: 'neutral', variant: 'outline' }"
          class="mx-auto max-w-4xl px-4 py-6 sm:px-10 sm:py-8"
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
            :ui="{
              container: message.role === 'user' ? 'max-w-[90%] pb-7 sm:max-w-[80%]' : 'gap-3 pb-8 sm:gap-4',
              leadingAvatar: 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/15',
              content: message.role === 'user' ? 'rounded-2xl rounded-tr-sm bg-muted px-4 py-3' : 'pt-1'
            }"
          >
            <template #content>
              <div class="min-w-0 space-y-4">
                <template v-if="message.role === 'assistant'">
                  <p class="text-xs font-semibold text-muted">
                    Assistant IA
                  </p>
                  <AssistantMarkdown :content="message.content" />
                </template>
                <p v-else class="whitespace-pre-wrap text-sm leading-6 text-default">
                  {{ message.content }}
                </p>

                <UAlert
                  v-if="message.error"
                  role="alert"
                  color="error"
                  variant="subtle"
                  :icon="message.error.code === 'sql_rejected' ? 'i-lucide-shield-alert' : 'i-lucide-triangle-alert'"
                  :title="message.error.code === 'sql_rejected' ? 'Réponse contrainte par les garde-fous' : 'Assistant indisponible'"
                  :description="message.error.message"
                />

                <UChatTool
                  v-if="message.query"
                  variant="card"
                  icon="i-lucide-database"
                  text="Données consultées"
                  :suffix="`${message.query.rowCount} ${message.query.rowCount === 1 ? 'résultat' : 'résultats'}`"
                  :default-open="debug"
                  :ui="{
                    root: 'rounded-lg ring-muted',
                    trigger: 'gap-2 bg-muted/50 px-3 py-3 text-xs font-medium text-toned hover:bg-muted transition-colors motion-reduce:transition-none',
                    suffix: 'text-muted',
                    body: 'max-h-80 whitespace-normal border-muted p-4 text-default'
                  }"
                >
                  <div class="space-y-3">
                    <p class="text-sm leading-6 text-toned">
                      {{ message.query.summary }}
                    </p>
                    <UBadge v-if="message.query.truncated" color="warning" variant="subtle">
                      Résultat tronqué à 50 lignes
                    </UBadge>
                    <div v-if="message.query.sql" class="overflow-x-auto rounded-md bg-muted p-3">
                      <pre class="text-xs leading-5 text-toned">{{ message.query.sql }}</pre>
                    </div>
                    <div v-if="message.query.table.rows.length" class="overflow-hidden rounded-md border border-muted">
                      <UTable
                        :data="message.query.table.rows"
                        :columns="buildTableColumns(message.query.table.columns)"
                        :ui="{
                          base: 'border-separate border-spacing-0',
                          th: 'border-b border-muted bg-muted px-3 py-2 text-xs text-toned',
                          td: 'border-b border-muted px-3 py-2 align-top',
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

          <template #indicator>
            <div role="status" class="flex items-center gap-3 pb-5 text-sm text-muted">
              <UIcon name="i-lucide-loader-circle" class="size-4 motion-safe:animate-spin" />
              Recherche dans vos données…
            </div>
          </template>
        </UChatMessages>
      </div>
    </template>

    <template #footer>
      <div class="shrink-0 bg-default px-4 pt-3 pb-4 sm:px-10 sm:pb-5">
        <div class="mx-auto w-full max-w-4xl sm:px-0">
          <UChatPrompt
            v-bind="posInputAttrs"
            ref="composer"
            v-model="prompt"
            aria-label="Votre question"
            class="rounded-xl bg-default p-3 shadow-sm sm:p-4"
            :placeholder="hasConversation ? 'Précisez votre question ou posez-en une nouvelle…' : 'Posez une question sur votre activité…'"
            :disabled="pending"
            :autofocus="false"
            :rows="2"
            :maxrows="5"
            :ui="{
              base: 'px-0 py-1 text-base leading-6 placeholder:text-muted',
              footer: 'mt-2 gap-3'
            }"
            @submit.prevent="submitPrompt"
          >
            <template #footer>
              <span class="text-xs text-muted">
                <span class="hidden sm:inline">Entrée pour envoyer · </span>Maj + Entrée pour aller à la ligne
              </span>
              <UChatPromptSubmit
                color="primary"
                size="sm"
                aria-label="Envoyer la question"
                :disabled="pending || !prompt.trim()"
                :loading="pending"
                class="shrink-0 rounded-lg"
              />
            </template>
          </UChatPrompt>
          <p class="mt-3 text-center text-xs leading-5 text-muted">
            Aucune donnée modifiée. Les informations sensibles restent exclues.
          </p>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
