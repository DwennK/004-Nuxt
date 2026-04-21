<script setup lang="ts">
import { format } from 'date-fns'
import type { SentMailDetail, SentMailSummary } from '~~/shared/types/pos'
import { getSentMailStatusMeta } from '~~/shared/utils/sent-email'

const props = defineProps<{
  summary: SentMailSummary | null
  mail: SentMailDetail | null
  loading?: boolean
  errorMessage?: string | null
}>()

const emits = defineEmits<{
  close: []
}>()

const displayedMail = computed(() => props.mail || props.summary)
</script>

<template>
  <UDashboardPanel id="sent-mails-detail">
    <UDashboardNavbar :title="displayedMail?.subject || 'Mails envoyés'" :toggle="false">
      <template #leading>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          class="-ms-1.5"
          @click="emits('close')"
        />
      </template>

      <template #right>
        <UBadge
          v-if="displayedMail"
          :color="getSentMailStatusMeta(displayedMail.lastEvent).color"
          variant="subtle"
        >
          {{ getSentMailStatusMeta(displayedMail.lastEvent).label }}
        </UBadge>
      </template>
    </UDashboardNavbar>

    <template v-if="displayedMail">
      <div class="border-b border-default p-4 sm:px-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-3">
            <div class="space-y-1">
              <p class="text-xs uppercase tracking-[0.14em] text-toned">
                À
              </p>
              <p class="font-medium text-highlighted">
                {{ displayedMail.to.join(', ') || 'Destinataire inconnu' }}
              </p>
            </div>

            <div class="grid gap-3 text-sm text-toned sm:grid-cols-3">
              <div>
                <p class="text-xs uppercase tracking-[0.14em] text-toned">
                  De
                </p>
                <p class="mt-1 text-default">
                  {{ displayedMail.from || '—' }}
                </p>
              </div>

              <div>
                <p class="text-xs uppercase tracking-[0.14em] text-toned">
                  Reply-to
                </p>
                <p class="mt-1 text-default">
                  {{ displayedMail.replyTo.join(', ') || '—' }}
                </p>
              </div>

              <div>
                <p class="text-xs uppercase tracking-[0.14em] text-toned">
                  Envoyé le
                </p>
                <p class="mt-1 text-default">
                  {{ format(new Date(displayedMail.createdAt), 'dd MMM yyyy HH:mm') }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="mail && (mail.cc.length || mail.bcc.length)"
          class="mt-4 grid gap-3 border-t border-default pt-4 text-sm text-toned sm:grid-cols-2"
        >
          <div v-if="mail.cc.length">
            <p class="text-xs uppercase tracking-[0.14em] text-toned">
              Cc
            </p>
            <p class="mt-1 text-default">
              {{ mail.cc.join(', ') }}
            </p>
          </div>

          <div v-if="mail.bcc.length">
            <p class="text-xs uppercase tracking-[0.14em] text-toned">
              Bcc
            </p>
            <p class="mt-1 text-default">
              {{ mail.bcc.join(', ') }}
            </p>
          </div>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <UAlert
          v-if="errorMessage"
          icon="i-lucide-triangle-alert"
          color="error"
          variant="soft"
          title="Détail indisponible"
          :description="errorMessage"
        />

        <div v-else-if="loading" class="space-y-3">
          <USkeleton class="h-5 w-2/3" />
          <USkeleton class="h-5 w-full" />
          <USkeleton class="h-5 w-full" />
          <USkeleton class="h-5 w-4/5" />
        </div>

        <div v-else-if="mail?.bodyText" class="whitespace-pre-wrap text-sm text-default">
          {{ mail.bodyText }}
        </div>

        <UEmpty
          v-else
          icon="i-lucide-file-text"
          title="Contenu indisponible"
          description="Resend n’a retourné aucun texte exploitable pour cet e-mail."
          class="py-12"
        />
      </div>
    </template>

    <div v-else class="flex flex-1 items-center justify-center">
      <UEmpty
        icon="i-lucide-send"
        title="Sélectionnez un e-mail"
        description="Choisissez un envoi dans la liste pour afficher son contenu."
        class="py-12"
      />
    </div>
  </UDashboardPanel>
</template>
