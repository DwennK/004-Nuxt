<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AssistantTableCell } from '~~/shared/types/assistant'
import { ASSISTANT_MAX_MESSAGE_LENGTH } from '~~/shared/utils/assistant'

type ChatRow = Record<string, AssistantTableCell>
const prompt = ref('')
const debug = ref(false)
const { messages, status, activity, activeId, pending, retryable, send, retry, stop, reset } = useAssistantChat()
const { copy, copied, text: copiedText } = useClipboard()
const toast = useToast()
const composer = useTemplateRef('composer')
const hasConversation = computed(() => messages.value.length > 0)
const chatMessages = computed(() => messages.value.map(message => ({
  ...message,
  parts: [{ type: 'text' as const, text: message.content }]
})))
const submitStatus = computed(() => status.value === 'error' && (prompt.value.trim() || !retryable.value) ? 'ready' : status.value)

const suggestionPrompts = [
  { icon: 'i-lucide-receipt', label: 'Factures du jour', prompt: 'Quelle est la plus grosse facture du jour ?' },
  { icon: 'i-lucide-wallet', label: 'Encaissements', prompt: 'Quel total encaissé par mode de paiement cette semaine ?' },
  { icon: 'i-lucide-wrench', label: 'Dossiers ouverts', prompt: 'Combien de dossiers sont encore ouverts par statut ?' },
  { icon: 'i-lucide-smartphone', label: 'Réservations', prompt: 'Quel est l’état des demandes de réservation smartphone ?' }
]

function formatCellValue(value: AssistantTableCell) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
  if (typeof value === 'number') return Number.isInteger(value) ? new Intl.NumberFormat('fr-CH').format(value) : String(value)
  return value
}

function buildTableColumns(columns: string[]): TableColumn<ChatRow>[] {
  return columns.map(column => ({
    accessorKey: column,
    header: column.replaceAll('_', ' '),
    cell: ({ row }) => h('span', {
      class: 'block max-w-80 whitespace-normal break-words text-sm text-default'
    }, formatCellValue(row.original[column] ?? null))
  }))
}

function usePromptSuggestion(text: string) {
  prompt.value = text
  composer.value?.textareaRef?.focus()
}

function submitPrompt() {
  const value = prompt.value.trim()
  if (!value || pending.value) return
  prompt.value = ''
  void send(value, debug.value)
}

async function copyMessage(content: string) {
  try {
    await copy(content)
  } catch {
    toast.add({ title: 'La copie a échoué', description: 'Sélectionnez le texte pour le copier.', color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel
    id="assistant"
    :ui="{ root: 'h-dvh min-h-0 bg-default', body: 'relative min-h-0 gap-0 overflow-hidden p-0 sm:p-0' }"
  >
    <template #header>
      <UDashboardNavbar title="Assistant IA">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            v-if="hasConversation"
            icon="i-lucide-square-pen"
            aria-label="Nouvelle conversation"
            title="Nouvelle conversation"
            color="neutral"
            variant="ghost"
            class="text-white hover:bg-white/15"
            :disabled="pending"
            @click="reset"
          />
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
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
          :messages="chatMessages"
          :status="pending ? 'streaming' : status"
          :should-scroll-to-bottom="false"
          should-auto-scroll
          :auto-scroll="{ label: 'Derniers messages', color: 'neutral', variant: 'outline' }"
          :ui="{ viewport: 'top-auto bottom-3 z-10 pointer-events-none', autoScroll: 'pointer-events-auto shadow-sm' }"
          :user="{ side: 'right', variant: 'soft', ui: { container: 'max-w-[90%] sm:max-w-[80%]', content: 'rounded-2xl rounded-tr-sm bg-muted px-4 py-3' } }"
          :assistant="{ side: 'left', variant: 'naked', avatar: { icon: 'i-lucide-sparkles' }, ui: { leadingAvatar: 'bg-primary/10 text-primary', content: 'min-w-0 pt-1' } }"
          class="mx-auto max-w-4xl px-4 py-6 sm:px-10 sm:py-8"
        >
          <template #content="{ message }">
            <div class="min-w-0 space-y-4">
              <template v-if="message.role === 'assistant'">
                <p class="text-xs font-semibold text-muted">
                  Assistant IA
                </p>
                <AssistantMarkdown
                  v-if="message.content"
                  :content="message.content"
                  :streaming="message.id === activeId && status === 'streaming'"
                />
                <div v-if="message.id === activeId" role="status" class="flex items-center gap-2 text-xs text-muted">
                  <UChatShimmer :text="activity" />
                </div>
                <p v-if="message.stopped" role="status" class="text-xs text-muted">
                  Réponse arrêtée.
                </p>
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
                :actions="message.error.retryable && message.id === messages.at(-1)?.id ? [{ label: 'Réessayer', icon: 'i-lucide-rotate-ccw', disabled: pending, onClick: () => retry(debug) }] : undefined"
              />

              <UChatTool
                v-for="tool in message.tools || []"
                :key="tool.id"
                variant="card"
                icon="i-lucide-database"
                :text="tool.summary"
                :streaming="tool.state === 'running'"
                :suffix="tool.state === 'running' ? 'En cours…' : tool.state === 'error' ? 'Recherche non aboutie' : tool.state === 'stopped' ? 'Arrêtée' : `${tool.query?.rowCount ?? 0} ${tool.query?.rowCount === 1 ? 'ligne retournée' : 'lignes retournées'}`"
                :default-open="debug"
                :ui="{
                  root: 'rounded-lg ring-muted',
                  trigger: 'gap-2 bg-muted/50 px-3 py-3 text-xs font-medium text-toned hover:bg-muted transition-colors motion-reduce:transition-none',
                  suffix: 'text-muted',
                  body: 'max-h-80 whitespace-normal border-muted p-4 text-default'
                }"
              >
                <div v-if="tool.query" class="space-y-3">
                  <p class="text-sm leading-6 text-toned">
                    {{ tool.query.summary }}
                  </p>
                  <UBadge v-if="tool.query.truncated" color="warning" variant="subtle">
                    Résultat tronqué à 50 lignes
                  </UBadge>
                  <div v-if="tool.query.sql" class="overflow-x-auto rounded-md bg-muted p-3">
                    <pre class="text-xs leading-5 text-toned">{{ tool.query.sql }}</pre>
                  </div>
                  <div v-if="tool.query.table.rows.length" class="overflow-hidden rounded-md border border-muted">
                    <UTable
                      :data="tool.query.table.rows"
                      :columns="buildTableColumns(tool.query.table.columns)"
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
          <template #actions="{ message }">
            <UButton
              v-if="message.role === 'assistant' && message.content && message.id !== activeId"
              :icon="copied && copiedText === message.content ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied && copiedText === message.content ? 'Copié' : 'Copier'"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="copyMessage(message.content)"
            />
            <UButton
              v-if="message.stopped && message.id === messages.at(-1)?.id"
              label="Réessayer"
              icon="i-lucide-rotate-ccw"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="pending"
              @click="retry(debug)"
            />
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
            :maxlength="ASSISTANT_MAX_MESSAGE_LENGTH"
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
                :aria-label="pending ? 'Arrêter la réponse' : submitStatus === 'error' ? 'Réessayer' : 'Envoyer la question'"
                :status="submitStatus"
                :disabled="!prompt.trim()"
                class="shrink-0 rounded-lg"
                @stop.prevent="stop"
                @reload.prevent="retry(debug)"
              />
            </template>
          </UChatPrompt>
          <p class="mt-3 text-center text-xs leading-5 text-muted">
            Aucune donnée modifiée. Codes d’accès et secrets exclus.
          </p>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
