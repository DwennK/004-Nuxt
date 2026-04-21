<script setup lang="ts">
import { format, isToday } from 'date-fns'
import type { SentMailSummary } from '~~/shared/types/pos'
import { getSentMailStatusMeta } from '~~/shared/utils/sent-email'

const props = defineProps<{
  mails: SentMailSummary[]
  loading?: boolean
}>()

const mailsRefs = ref<Record<string, Element | null>>({})
const selectedMailId = defineModel<string | null>()

watch(selectedMailId, () => {
  if (!selectedMailId.value) {
    return
  }

  const mailRef = mailsRefs.value[selectedMailId.value]

  if (mailRef) {
    mailRef.scrollIntoView({ block: 'nearest' })
  }
})

defineShortcuts({
  arrowdown: () => {
    const index = props.mails.findIndex(mail => mail.id === selectedMailId.value)

    if (index === -1) {
      selectedMailId.value = props.mails[0]?.id || null
    } else if (index < props.mails.length - 1) {
      selectedMailId.value = props.mails[index + 1]!.id
    }
  },
  arrowup: () => {
    const index = props.mails.findIndex(mail => mail.id === selectedMailId.value)

    if (index === -1) {
      selectedMailId.value = props.mails.at(-1)?.id || null
    } else if (index > 0) {
      selectedMailId.value = props.mails[index - 1]!.id
    }
  }
})
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto divide-y divide-default">
    <div
      v-for="mail in mails"
      :key="mail.id"
      :ref="(el) => { mailsRefs[mail.id] = el as Element | null }"
    >
      <button
        type="button"
        class="flex w-full flex-col gap-1.5 border-l-2 px-4 py-3 text-left text-sm transition-colors sm:px-5"
        :class="selectedMailId === mail.id
          ? 'border-primary bg-primary/10'
          : 'border-transparent hover:border-primary/50 hover:bg-primary/5'"
        @click="selectedMailId = mail.id"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-[15px] font-medium text-highlighted">
              {{ mail.to[0] || 'Destinataire inconnu' }}
            </p>
          </div>

          <span class="shrink-0 text-xs text-toned">
            {{ isToday(new Date(mail.createdAt)) ? format(new Date(mail.createdAt), 'HH:mm') : format(new Date(mail.createdAt), 'dd MMM') }}
          </span>
        </div>

        <div class="flex items-start gap-3">
          <p class="min-w-0 flex-1 truncate font-medium text-default">
            {{ mail.subject }}
          </p>

          <span
            class="mt-1 size-2 shrink-0 rounded-full"
            :class="getSentMailStatusMeta(mail.lastEvent).color === 'success'
              ? 'bg-success'
              : getSentMailStatusMeta(mail.lastEvent).color === 'error'
                ? 'bg-error'
                : getSentMailStatusMeta(mail.lastEvent).color === 'warning'
                  ? 'bg-warning'
                  : getSentMailStatusMeta(mail.lastEvent).color === 'primary'
                    ? 'bg-primary'
                    : 'bg-muted'"
          />
        </div>

        <p class="truncate text-xs text-toned">
          {{ mail.preview || mail.from || mail.replyTo[0] || 'Aucun aperçu disponible' }}
        </p>
      </button>
    </div>

    <div v-if="loading && !mails.length" class="space-y-3 p-4 sm:px-6">
      <USkeleton class="h-20 w-full rounded-2xl" />
      <USkeleton class="h-20 w-full rounded-2xl" />
      <USkeleton class="h-20 w-full rounded-2xl" />
    </div>
  </div>
</template>
