<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { nextTick } from 'vue'

import type { DocumentSavePayload } from '~~/app/composables/useDocumentDraft'
import type { CustomerListResponse, DocumentDetail, DocumentEmailInput, SentMailSendResult } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { documentEmailSchema } from '~~/shared/validation/pos'
import { getDocumentEmailMessage, getDocumentEmailSubject } from '~~/shared/utils/document-email'
import { supportsDocumentPrintProfile } from '~~/shared/utils/print'
import { formatCurrency, isPayableDocumentType } from '~~/shared/utils/pos'
import { readPendingEmailAttempt, type PendingEmailAttempt } from '~~/shared/utils/email-attempt'

const route = useRoute()
const toast = useToast()
const { can } = useCapabilities()
const { user } = useUserSession()
const id = computed(() => Number(route.params.id))
const activeTab = ref(route.query.tab === 'payments' ? 'payments' : 'lines')
const isEmailModalOpen = ref(false)
const isSendingEmail = ref(false)
const emailAttempt = ref<PendingEmailAttempt | null>(null)
const emailStorageKey = computed(() => `pos:pending-email:${user.value?.id}:${id.value}`)
const emailAttemptLocked = ref(false)
const emailFeedback = ref<string | null>(null)
const emailFailed = ref(false)
const isSavingDocument = ref(false)
const isContextOpen = ref(false)
const hasUnsavedDocumentChanges = ref(false)
const hasOpenedInitialEmailModal = ref(false)
const documentFormId = 'document-detail-form'
const documentEditor = useTemplateRef<{ acceptSaved: (saved: DocumentDetail, submitted: DocumentSavePayload) => void }>('documentEditor')
const unsavedDocumentMessage = 'Des modifications du document ne sont pas enregistrées. Continuer sans enregistrer ?'

const tabItems = [
  { label: 'Lignes', value: 'lines', icon: 'i-lucide-list' },
  { label: 'Paiements', value: 'payments', icon: 'i-lucide-wallet' }
]

type DocumentEmailForm = z.output<typeof documentEmailSchema>

const emailState = reactive<DocumentEmailInput>({
  to: '',
  subject: '',
  message: ''
})

const [{ data: document, refresh }, { data: customers }, { data: company }] = await Promise.all([
  useFetch<DocumentDetail>(() => `/api/documents/${id.value}`),
  useFetch<CustomerListResponse>('/api/customers', { query: { pageSize: 250 } }),
  useFetch<CompanySettingsRecord>('/api/settings/company')
])

const paidAmount = computed(() => document.value?.payments
  .filter(payment => payment.status === 'paid')
  .reduce((total: number, payment) => total + payment.amount, 0) || 0)

const isPayableDocument = computed(() => document.value ? isPayableDocumentType(document.value.type) : false)
const canAdjustFinancialRecords = computed(() => can('financial:adjust'))
const canEditDocument = computed(() => canAdjustFinancialRecords.value)
const documentLockTitle = 'Modification réservée aux administrateurs'
const documentLockDescription = 'Les opérateurs peuvent consulter, envoyer, imprimer et encaisser ce document sans modifier son écriture commerciale.'
const balanceDue = computed(() => isPayableDocument.value ? Math.max((document.value?.total || 0) - paidAmount.value, 0) : 0)
const supportsA4Print = computed(() => document.value ? supportsDocumentPrintProfile(document.value.type, 'a4') : false)
const supportsThermalPrint = computed(() => document.value ? supportsDocumentPrintProfile(document.value.type, 'thermal') : false)
const documentActionsDisabled = computed(() => hasUnsavedDocumentChanges.value || isSavingDocument.value)
const saveButtonLabel = computed(() => hasUnsavedDocumentChanges.value ? 'Enregistrer les modifications' : 'Enregistrer')

async function saveDocument(payload: DocumentSavePayload) {
  if (!canEditDocument.value) {
    toast.add({
      title: documentLockTitle,
      description: documentLockDescription,
      color: 'warning'
    })
    return
  }

  isSavingDocument.value = true
  const documentId = id.value

  try {
    const saved = await $fetch<DocumentDetail>(`/api/documents/${documentId}`, {
      method: 'PATCH',
      body: payload
    })
    if (id.value !== documentId) return
    documentEditor.value?.acceptSaved(saved, payload)
    document.value = saved

    toast.add({
      title: 'Document mis à jour',
      color: 'success'
    })

    await refresh()
  } finally {
    isSavingDocument.value = false
  }
}

async function openContextEditor() {
  if (!canEditDocument.value) {
    return
  }

  if (activeTab.value !== 'lines') {
    activeTab.value = 'lines'
    await nextTick()
  }

  isContextOpen.value = true
}

function shouldConfirmUnsavedDocumentChanges() {
  return hasUnsavedDocumentChanges.value && !isSavingDocument.value
}

function confirmDiscardUnsavedDocumentChanges() {
  if (!shouldConfirmUnsavedDocumentChanges()) {
    return true
  }

  const shouldContinue = window.confirm(unsavedDocumentMessage)

  if (shouldContinue) {
    hasUnsavedDocumentChanges.value = false
  }

  return shouldContinue
}

function selectTab(value: string | number) {
  const nextTab = String(value)

  if (nextTab === activeTab.value) {
    return
  }

  if (hasUnsavedDocumentChanges.value) {
    toast.add({
      title: 'Enregistrement requis',
      description: 'Enregistrez le document avant de consulter ou ajouter des paiements.',
      color: 'warning'
    })
    return
  }

  activeTab.value = nextTab
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!shouldConfirmUnsavedDocumentChanges()) {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  return confirmDiscardUnsavedDocumentChanges()
})

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)

  if (route.query.email === '1' && supportsA4Print.value && !hasOpenedInitialEmailModal.value) {
    hasOpenedInitialEmailModal.value = true
    openEmailModal()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

function fillEmailState() {
  if (!document.value) {
    return
  }

  emailState.to = document.value.customer.email || ''
  emailState.subject = getDocumentEmailSubject(document.value)
  emailState.message = getDocumentEmailMessage(document.value, company.value || { name: 'Votre boutique' })
}

function openEmailModal() {
  if (documentActionsDisabled.value) {
    toast.add({
      title: 'Enregistrement requis',
      description: 'Enregistrez le document avant de l’envoyer par e-mail.',
      color: 'warning'
    })
    return
  }

  try {
    emailAttempt.value = readPendingEmailAttempt(window.sessionStorage, emailStorageKey.value)
  } catch {
    toast.add({ title: 'Envoi indisponible', description: 'La sauvegarde de la tentative dans cet onglet est inaccessible. Vérifiez l’historique avant tout nouvel envoi.', color: 'warning' })
    return
  }
  emailAttemptLocked.value = !!emailAttempt.value
  if (emailAttempt.value) {
    Object.assign(emailState, emailAttempt.value.payload)
    emailFeedback.value = 'Une tentative est enregistrée dans cet onglet. Vérifiez son résultat avant tout nouvel envoi.'
  } else {
    fillEmailState()
  }
  isEmailModalOpen.value = true
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const fetchError = error as {
      data?: { statusMessage?: string, message?: string }
      statusMessage?: string
      message?: string
    }

    return fetchError.data?.statusMessage
      || fetchError.data?.message
      || fetchError.statusMessage
      || fetchError.message
      || 'Envoi impossible'
  }

  return 'Envoi impossible'
}

async function submitDocumentEmail(event: FormSubmitEvent<DocumentEmailForm>) {
  if (isSendingEmail.value) return
  const storageKey = emailStorageKey.value
  const attempt = emailAttempt.value || { key: crypto.randomUUID(), payload: { ...event.data } }
  try {
    // Persist synchronously before making the request, including across reloads.
    window.sessionStorage.setItem(storageKey, JSON.stringify(attempt))
  } catch {
    toast.add({ title: 'Envoi indisponible', description: 'Impossible de conserver la tentative dans cet onglet. Aucun message n’a été envoyé.', color: 'error' })
    return
  }
  emailAttempt.value = attempt
  isSendingEmail.value = true
  emailAttemptLocked.value = true
  emailFeedback.value = null
  emailFailed.value = false

  try {
    const result = await $fetch<SentMailSendResult>(`/api/documents/${id.value}/email`, {
      method: 'POST',
      headers: { 'Idempotency-Key': attempt.key },
      body: attempt.payload,
      retry: 0
    })

    if (!result.ok) {
      emailFeedback.value = result.errorMessage || 'Envoi en cours. Vérifiez son résultat avant de renvoyer le document.'
      emailFailed.value = ['failed', 'bounced', 'rejected'].includes(result.status)
      return
    }
    window.sessionStorage.removeItem(storageKey)
    emailAttempt.value = null
    emailAttemptLocked.value = false
    isEmailModalOpen.value = false

    toast.add({
      title: result.replayed ? 'Envoi déjà enregistré' : 'E-mail envoyé',
      description: `Le document ${document.value?.documentNumber || ''} a été confié au service d’envoi pour ${event.data.to}.`,
      color: 'success'
    })
  } catch (error) {
    const code = (error as { data?: { data?: { code?: string } } })?.data?.data?.code
    emailFailed.value = !!code && ['EMAIL_NOT_CONFIGURED', 'EMAIL_INVALID_ADDRESS', 'EMAIL_TOO_LARGE'].includes(code)
    emailFeedback.value = `${getErrorMessage(error)} La même tentative sera réutilisée pour éviter un double envoi.`
    toast.add({
      title: 'Erreur',
      description: getErrorMessage(error),
      color: 'error'
    })
  } finally {
    isSendingEmail.value = false
  }
}

function startNewEmailAttempt() {
  // Only a confirmed refusal/failure permits a new send from this form.
  if (!emailFailed.value) return
  window.sessionStorage.removeItem(emailStorageKey.value)
  emailAttempt.value = null
  emailAttemptLocked.value = false
  emailFailed.value = false
  emailFeedback.value = null
}
</script>

<template>
  <UDashboardPanel id="document-detail">
    <template #header>
      <UDashboardNavbar :title="document?.documentNumber || 'Détail du document'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            v-if="supportsA4Print"
            icon="i-lucide-mail"
            label="Envoyer par mail"
            aria-label="Envoyer par mail"
            color="neutral"
            variant="subtle"
            :disabled="documentActionsDisabled"
            :ui="{ label: 'hidden sm:inline' }"
            @click="openEmailModal"
          />
          <UButton
            v-if="supportsA4Print"
            :to="`/documents/${id}/print?profile=a4`"
            icon="i-lucide-file-text"
            label="Imprimer A4"
            aria-label="Imprimer A4"
            color="neutral"
            variant="subtle"
            :disabled="documentActionsDisabled"
            :ui="{ label: 'hidden sm:inline' }"
          />
          <UButton
            v-if="supportsThermalPrint"
            :to="`/documents/${id}/print?profile=thermal`"
            icon="i-lucide-printer"
            label="Imprimer thermique"
            aria-label="Imprimer thermique"
            :disabled="documentActionsDisabled"
            :ui="{ label: 'hidden sm:inline' }"
          />
          <UButton
            v-if="activeTab === 'lines' && canEditDocument"
            :form="documentFormId"
            type="submit"
            icon="i-lucide-save"
            :label="saveButtonLabel"
            :loading="isSavingDocument"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="document && customers?.items" class="space-y-3">
        <PosDocumentDetailHeader
          :document="document"
          :paid-amount="paidAmount"
          :balance-due="balanceDue"
          :is-payable-document="isPayableDocument"
          :editable="canEditDocument"
          @edit-context="openContextEditor"
        />

        <div
          v-if="canEditDocument && hasUnsavedDocumentChanges"
          class="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex items-start gap-3">
            <div class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
              <UIcon name="i-lucide-triangle-alert" class="size-4.5" />
            </div>
            <div>
              <p class="text-sm font-medium text-highlighted">
                Modifications non enregistrées
              </p>
              <p class="text-sm text-toned">
                Enregistrez avant d’imprimer, d’envoyer par mail ou d’encaisser ce document.
              </p>
            </div>
          </div>

          <UButton
            :form="documentFormId"
            type="submit"
            label="Enregistrer"
            icon="i-lucide-save"
            color="warning"
            :loading="isSavingDocument"
            class="shrink-0"
          />
        </div>

        <UTabs
          :model-value="activeTab"
          :items="tabItems"
          value-key="value"
          variant="link"
          :content="false"
          class="w-full"
          @update:model-value="selectTab"
        />

        <div v-if="activeTab === 'lines'" class="grid gap-4 xl:h-[calc(100vh-18.5rem)]">
          <PosDocumentEditor
            v-if="customers?.items && canEditDocument"
            ref="documentEditor"
            v-model:context-open="isContextOpen"
            v-model:dirty="hasUnsavedDocumentChanges"
            :form-id="documentFormId"
            :show-submit-button="false"
            :customers="customers.items"
            :initial-value="document"
            :fixed-ticket-id="document.ticketId"
            submit-label="Enregistrer le document"
            @save="saveDocument"
          />

          <div v-else class="space-y-3">
            <UAlert
              icon="i-lucide-lock-keyhole"
              color="neutral"
              variant="subtle"
              :title="documentLockTitle"
              :description="documentLockDescription"
            />

            <UCard :ui="{ body: 'p-0 sm:p-0' }">
              <div class="divide-y divide-default">
                <div
                  v-for="line in document.lines"
                  :key="line.id"
                  class="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-highlighted">
                      {{ line.label }}
                    </p>
                    <p class="text-xs text-toned">
                      {{ line.quantity }} × {{ formatCurrency(line.unitPrice) }} · TVA {{ line.vatRate }}%
                    </p>
                  </div>
                  <span class="text-xs text-toned sm:text-right">
                    Qté {{ line.quantity }}
                  </span>
                  <span class="text-sm font-semibold tabular-nums text-highlighted sm:min-w-28 sm:text-right">
                    {{ formatCurrency(line.lineTotal) }}
                  </span>
                </div>
              </div>

              <template #footer>
                <div class="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
                  <span class="text-toned">Sous-total TTC</span>
                  <span class="text-right tabular-nums">{{ formatCurrency(document.subtotal) }}</span>
                  <span class="text-toned">TVA incluse</span>
                  <span class="text-right tabular-nums">{{ formatCurrency(document.taxAmount) }}</span>
                  <span class="font-semibold text-highlighted">Total TTC</span>
                  <span class="text-right font-semibold tabular-nums text-highlighted">{{ formatCurrency(document.total) }}</span>
                </div>
              </template>
            </UCard>
          </div>
        </div>

        <div v-else-if="activeTab === 'payments'" class="flex min-h-0 flex-col gap-3 xl:h-[calc(100vh-18.5rem)]">
          <div v-if="document.shopify" class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm text-muted">Shopify {{ document.shopify.orderName }} · {{ document.shopify.domain }}</span>
            <PosShopifyPaymentSync v-if="canAdjustFinancialRecords" :document-id="document.id" @refresh="refresh()" />
          </div>
          <PosDocumentPaymentsEditor
            :document-id="document.id"
            :payments="document.payments"
            :document-total="document.total"
            :balance-due="balanceDue"
            :is-payable-document="isPayableDocument"
            class="min-h-0 flex-1"
            @refresh="refresh()"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <UModal
    v-model:open="isEmailModalOpen"
    title="Envoyer le document par e-mail"
    description="Le document sera joint en PDF A4 pour l’envoi au client."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UForm
        :schema="documentEmailSchema"
        :state="emailState"
        class="space-y-4"
        @submit="submitDocumentEmail"
      >
        <UAlert
          v-if="emailFeedback"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="Suivi de l’envoi"
          :description="emailFeedback"
        />
        <UFormField label="Destinataire" name="to" required>
          <UInput
            v-model="emailState.to"
            :disabled="emailAttemptLocked"
            type="email"
            class="w-full"
            placeholder="client@example.com"
          />
        </UFormField>

        <UFormField label="Objet" name="subject" required>
          <UInput
            v-model="emailState.subject"
            :disabled="emailAttemptLocked"
            class="w-full"
            placeholder="Votre facture FA-123"
          />
        </UFormField>

        <UFormField label="Message" name="message" required>
          <UTextarea
            v-model="emailState.message"
            :disabled="emailAttemptLocked"
            :rows="8"
            class="w-full"
            autoresize
          />
        </UFormField>

        <div class="flex flex-wrap items-center justify-end gap-2">
          <UButton
            v-if="emailFailed"
            color="warning"
            variant="soft"
            label="Préparer un nouvel envoi"
            @click="startNewEmailAttempt"
          />
          <UButton
            color="neutral"
            variant="soft"
            label="Annuler"
            :disabled="isSendingEmail"
            @click="isEmailModalOpen = false"
          />
          <UButton
            type="submit"
            icon="i-lucide-send"
            :label="emailAttemptLocked ? 'Vérifier l’envoi' : 'Envoyer'"
            :loading="isSendingEmail"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
