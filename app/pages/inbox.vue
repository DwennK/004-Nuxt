<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { breakpointsTailwind } from '@vueuse/core'
import type { SentMailDetail, SentMailListResponse, SentMailSummary } from '~~/shared/types/pos'

const PAGE_SIZE = 20

const currentQuery = ref<{ after?: string }>({})
const queryHistory = ref<Array<{ after?: string }>>([])
const selectedMailId = ref<string | null>(null)
const selectedMail = ref<SentMailDetail | null>(null)
const selectedMailPending = ref(false)
const selectedMailErrorMessage = ref<string | null>(null)

const listQuery = computed(() => ({
  limit: PAGE_SIZE,
  after: currentQuery.value.after
}))

const { data: mailsResponse, status, error, refresh } = await useFetch<SentMailListResponse>('/api/sent-emails', {
  query: listQuery,
  default: () => ({
    items: [],
    hasMore: false,
    beforeCursor: null,
    afterCursor: null,
    limit: PAGE_SIZE
  })
})

const mails = computed(() => mailsResponse.value?.items || [])
const selectedMailSummary = computed<SentMailSummary | null>(() =>
  mails.value.find(mail => mail.id === selectedMailId.value) || null
)

function getFetchErrorMessage(fetchError: unknown, fallback: string) {
  if (!fetchError || typeof fetchError !== 'object') {
    return fallback
  }

  if ('data' in fetchError && fetchError.data && typeof fetchError.data === 'object' && 'statusMessage' in fetchError.data) {
    const statusMessage = fetchError.data.statusMessage

    if (typeof statusMessage === 'string' && statusMessage.trim()) {
      return statusMessage
    }
  }

  if ('statusMessage' in fetchError && typeof fetchError.statusMessage === 'string' && fetchError.statusMessage.trim()) {
    return fetchError.statusMessage
  }

  if ('message' in fetchError && typeof fetchError.message === 'string' && fetchError.message.trim()) {
    return fetchError.message
  }

  return fallback
}

const listErrorMessage = computed(() =>
  error.value
    ? getFetchErrorMessage(error.value, 'Impossible de charger les e-mails envoyés.')
    : null
)

async function loadSelectedMail(id: string) {
  selectedMailPending.value = true
  selectedMailErrorMessage.value = null

  try {
    selectedMail.value = await $fetch<SentMailDetail>(`/api/sent-emails/${encodeURIComponent(id)}`)
  } catch (fetchError) {
    selectedMail.value = null
    selectedMailErrorMessage.value = getFetchErrorMessage(fetchError, 'Impossible de charger le détail de cet e-mail.')
  } finally {
    selectedMailPending.value = false
  }
}

watch(mails, (items) => {
  if (!items.length) {
    selectedMailId.value = null
    selectedMail.value = null
    selectedMailErrorMessage.value = null
    return
  }

  if (selectedMailId.value && items.some(mail => mail.id === selectedMailId.value)) {
    return
  }

  selectedMailId.value = items[0]!.id
}, { immediate: true })

watch(selectedMailId, (id) => {
  if (!id) {
    selectedMail.value = null
    selectedMailErrorMessage.value = null
    return
  }

  void loadSelectedMail(id)
})

async function refreshMails() {
  await refresh()

  if (selectedMailId.value) {
    await loadSelectedMail(selectedMailId.value)
  }
}

function goToOlderPage() {
  const afterCursor = mailsResponse.value?.afterCursor

  if (!afterCursor) {
    return
  }

  queryHistory.value.push({ ...currentQuery.value })
  currentQuery.value = { after: afterCursor }
}

function goToNewerPage() {
  const previousQuery = queryHistory.value.pop()

  if (!previousQuery) {
    return
  }

  currentQuery.value = previousQuery
}

const canGoToOlder = computed(() =>
  Boolean(mailsResponse.value?.hasMore && mailsResponse.value?.afterCursor) && status.value !== 'pending'
)

const canGoToNewer = computed(() =>
  queryHistory.value.length > 0 && status.value !== 'pending'
)

const isMailPanelOpen = computed({
  get() {
    return !!selectedMailId.value
  },
  set(value: boolean) {
    if (!value) {
      selectedMailId.value = null
    }
  }
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
</script>

<template>
  <UDashboardPanel
    id="sent-mails-list"
    :default-size="30"
    :min-size="22"
    :max-size="36"
    resizable
  >
    <UDashboardNavbar title="Mails envoyés">
      <template #leading>
        <UDashboardSidebarCollapse />
      </template>

      <template #trailing>
        <div class="flex items-center gap-2">
          <UBadge :label="mails.length" variant="subtle" />
          <UButton
            type="button"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="status === 'pending'"
            @click="refreshMails"
          />
        </div>
      </template>
    </UDashboardNavbar>

    <div class="flex min-h-0 flex-1 flex-col">
      <UAlert
        v-if="listErrorMessage"
        icon="i-lucide-triangle-alert"
        color="error"
        variant="soft"
        title="Chargement impossible"
        :description="listErrorMessage"
        class="m-4"
      />

      <UEmpty
        v-else-if="!mails.length && status !== 'pending'"
        icon="i-lucide-send"
        title="Aucun e-mail envoyé"
        description="Les e-mails envoyés via Resend apparaîtront ici."
        class="flex-1 py-12"
      />

      <InboxList
        v-else
        v-model="selectedMailId"
        :mails="mails"
        :loading="status === 'pending'"
      />

      <div
        v-if="!listErrorMessage"
        class="flex items-center justify-between gap-3 border-t border-default px-4 py-3"
      >
        <span class="text-xs text-toned">
          {{ mails.length }} e-mail(s) sur cette page
        </span>

        <div class="flex items-center gap-2">
          <UButton
            type="button"
            label="Plus récents"
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!canGoToNewer"
            @click="goToNewerPage"
          />
          <UButton
            type="button"
            label="Plus anciens"
            trailing-icon="i-lucide-chevron-right"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!canGoToOlder"
            @click="goToOlderPage"
          />
        </div>
      </div>
    </div>
  </UDashboardPanel>

  <InboxMail
    v-if="!isMobile"
    :summary="selectedMailSummary"
    :mail="selectedMail"
    :loading="selectedMailPending"
    :error-message="selectedMailErrorMessage"
    @close="selectedMailId = null"
  />

  <ClientOnly>
    <USlideover v-if="isMobile" v-model:open="isMailPanelOpen">
      <template #content>
        <InboxMail
          :summary="selectedMailSummary"
          :mail="selectedMail"
          :loading="selectedMailPending"
          :error-message="selectedMailErrorMessage"
          @close="selectedMailId = null"
        />
      </template>
    </USlideover>
  </ClientOnly>
</template>
