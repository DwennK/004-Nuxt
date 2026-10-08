<script setup lang="ts">
import type { CustomerRecord } from '~~/shared/types/pos'
import type { CustomerSmsSettingsRecord, SmsTemplateRecord } from '~~/shared/types/settings'
import { buildSmsHref, freeSmsTemplateId, normalizeSmsPhoneNumber, resolveSmsTemplateBody } from '~~/shared/utils/customer-sms'
import { createQrCodeDataUrl } from '~~/shared/utils/qr-code'

const props = defineProps<{
  customer: Pick<CustomerRecord, 'displayName' | 'phone'>
  referenceNumber: string
  brand?: string | null
  model?: string | null
  disabled?: boolean
  logQrOpen?: (template: SmsTemplateRecord) => Promise<void>
}>()

const toast = useToast()
const smsModalOpen = ref(false)
const selectedSmsTemplateId = ref<string>(freeSmsTemplateId)
const smsQrDataUrl = ref<string | null>(null)
const smsQrLoading = ref(false)
const smsLogKey = ref<string | null>(null)
const { data: customerSmsSettings } = await useFetch<CustomerSmsSettingsRecord>('/api/settings/customer-sms', { lazy: true })
const normalizedCustomerPhone = computed(() => normalizeSmsPhoneNumber(props.customer.phone))
const canSendSms = computed(() => Boolean(normalizedCustomerPhone.value))
const smsTemplateItems = computed(() => [
  ...(customerSmsSettings.value?.templates || []),
  { id: freeSmsTemplateId, label: 'Message libre', body: '' }
])
const selectedSmsTemplate = computed(() => smsTemplateItems.value.find(template => template.id === selectedSmsTemplateId.value))
const resolvedSmsMessage = computed(() => {
  if (!selectedSmsTemplate.value || selectedSmsTemplate.value.id === freeSmsTemplateId) return ''
  return resolveSmsTemplateBody(selectedSmsTemplate.value, {
    clientName: props.customer.displayName,
    ticketNumber: props.referenceNumber,
    brand: props.brand || '',
    model: props.model || ''
  })
})
const smsHref = computed(() => buildSmsHref(normalizedCustomerPhone.value, resolvedSmsMessage.value || null))

function openSmsModal() {
  selectedSmsTemplateId.value = freeSmsTemplateId
  smsQrDataUrl.value = null
  smsLogKey.value = null
  smsModalOpen.value = true
}

async function selectSmsTemplate(template: SmsTemplateRecord) {
  if (props.disabled || !canSendSms.value || smsQrLoading.value) return
  selectedSmsTemplateId.value = template.id
  smsQrLoading.value = true
  try {
    smsQrDataUrl.value = createQrCodeDataUrl(smsHref.value, {
      errorCorrectionLevel: 'M', margin: 1, width: 320
    })
    const nextLogKey = `${template.id}:${resolvedSmsMessage.value}:${normalizedCustomerPhone.value}`
    if (props.logQrOpen && smsLogKey.value !== nextLogKey) {
      await props.logQrOpen(template)
      smsLogKey.value = nextLogKey
    }
  } catch {
    toast.add({ title: 'Impossible de préparer le SMS', description: 'Réessayez de sélectionner le message.', color: 'error' })
  } finally {
    smsQrLoading.value = false
  }
}
</script>

<template>
  <UButton
    label="Envoyer un SMS"
    aria-label="Envoyer un SMS"
    icon="i-lucide-message-square-share"
    color="neutral"
    variant="subtle"
    :disabled="disabled || !canSendSms"
    :title="canSendSms ? undefined : 'Ajoutez un numéro de téléphone client pour envoyer un SMS.'"
    :ui="{ label: 'hidden sm:inline' }"
    @click="openSmsModal"
  />

  <UModal
    v-model:open="smsModalOpen"
    title="SMS client"
    :description="customer.phone ? `Scanner le QR avec l’iPhone pour ouvrir l’app Messages vers ${customer.displayName}.` : 'Ajoutez un numero de telephone pour utiliser ce flux.'"
    :ui="{ content: 'sm:max-w-5xl' }"
  >
    <template #body>
      <div class="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div class="space-y-2">
          <p class="text-xs uppercase tracking-[0.18em] text-toned">
            Messages
          </p>

          <UButton
            v-for="template in smsTemplateItems"
            :key="template.id"
            :disabled="disabled"
            :label="template.label"
            :icon="template.id === freeSmsTemplateId ? 'i-lucide-pencil-line' : 'i-lucide-message-circle-more'"
            :color="selectedSmsTemplateId === template.id ? 'primary' : 'neutral'"
            :variant="selectedSmsTemplateId === template.id ? 'solid' : 'soft'"
            block
            class="justify-start"
            @click="selectSmsTemplate(template)"
          />
        </div>

        <div class="space-y-4 rounded-2xl border border-default bg-muted/20 p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-toned">
                QR code
              </p>
              <p class="text-lg font-semibold text-highlighted">
                {{ selectedSmsTemplate?.label || 'Choisissez un message' }}
              </p>
              <p class="text-sm text-toned">
                {{ normalizedCustomerPhone || 'Numero manquant' }}
              </p>
            </div>

            <UButton
              v-if="smsHref"
              :disabled="disabled"
              :to="smsHref"
              external
              target="_blank"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-up-right"
              label="Ouvrir le lien"
            />
          </div>

          <div class="flex min-h-[22rem] items-center justify-center rounded-2xl border border-dashed border-default bg-white p-6">
            <div v-if="smsQrLoading" class="flex flex-col items-center gap-3 text-sm text-toned">
              <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin" />
              Génération du QR en cours...
            </div>
            <img
              v-else-if="smsQrDataUrl"
              :src="smsQrDataUrl"
              alt="QR code SMS client"
              class="h-auto w-full max-w-[20rem]"
            >
            <div v-else class="text-center text-sm text-toned">
              Choisissez un message pour afficher le QR code.
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.18em] text-toned">
              Aperçu du message
            </p>
            <div class="rounded-xl border border-default bg-default p-3 text-sm text-highlighted whitespace-pre-line">
              {{ resolvedSmsMessage || 'Aucun texte pré-rempli. L’opérateur saisira le message directement sur l’iPhone.' }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
