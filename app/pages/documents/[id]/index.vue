<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { nextTick } from 'vue'

import type { DocumentSavePayload } from '~~/app/composables/useDocumentDraft'
import type { CatalogItemRecord, CustomerRecord, DocumentDetail, DocumentEmailInput } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { documentEmailSchema } from '~~/shared/validation/pos'
import { getDocumentEmailMessage, getDocumentEmailSubject } from '~~/shared/utils/document-email'
import { supportsDocumentPrintProfile } from '~~/shared/utils/print'
import { isPayableDocumentType } from '~~/shared/utils/pos'

const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))
const activeTab = ref('lines')
const isEmailModalOpen = ref(false)
const isSendingEmail = ref(false)
const isContextOpen = ref(false)

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

const [{ data: document, refresh }, { data: customers }, { data: catalogItems }, { data: company }] = await Promise.all([
  useFetch<DocumentDetail>(() => `/api/documents/${id.value}`),
  useFetch<CustomerRecord[]>('/api/customers'),
  useFetch<CatalogItemRecord[]>('/api/catalog-items', { query: { activeOnly: true } }),
  useFetch<CompanySettingsRecord>('/api/settings/company')
])

const paidAmount = computed(() => document.value?.payments
  .filter(payment => payment.status === 'paid')
  .reduce((total: number, payment) => total + payment.amount, 0) || 0)

const isPayableDocument = computed(() => document.value ? isPayableDocumentType(document.value.type) : false)
const balanceDue = computed(() => isPayableDocument.value ? Math.max((document.value?.total || 0) - paidAmount.value, 0) : 0)
const supportsA4Print = computed(() => document.value ? supportsDocumentPrintProfile(document.value.type, 'a4') : false)
const supportsThermalPrint = computed(() => document.value ? supportsDocumentPrintProfile(document.value.type, 'thermal') : false)

async function saveDocument(payload: DocumentSavePayload) {
  await $fetch(`/api/documents/${id.value}`, {
    method: 'PATCH',
    body: payload
  })

  toast.add({
    title: 'Document mis à jour',
    color: 'success'
  })

  await refresh()
}

async function openContextEditor() {
  if (activeTab.value !== 'lines') {
    activeTab.value = 'lines'
    await nextTick()
  }

  isContextOpen.value = true
}

function fillEmailState() {
  if (!document.value) {
    return
  }

  emailState.to = document.value.customer.email || ''
  emailState.subject = getDocumentEmailSubject(document.value)
  emailState.message = getDocumentEmailMessage(document.value, company.value || { name: 'Votre boutique' })
}

function openEmailModal() {
  fillEmailState()
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
  isSendingEmail.value = true

  try {
    await $fetch(`/api/documents/${id.value}/email`, {
      method: 'POST',
      body: event.data
    })

    isEmailModalOpen.value = false

    toast.add({
      title: 'E-mail envoyé',
      description: `Le document ${document.value?.documentNumber || ''} a été envoyé à ${event.data.to}.`,
      color: 'success'
    })
  } catch (error) {
    toast.add({
      title: 'Erreur',
      description: getErrorMessage(error),
      color: 'error'
    })
  } finally {
    isSendingEmail.value = false
  }
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
            color="neutral"
            variant="subtle"
            @click="openEmailModal"
          />
          <UButton
            v-if="supportsA4Print"
            :to="`/documents/${id}/print?profile=a4`"
            icon="i-lucide-file-text"
            label="Imprimer A4"
            color="neutral"
            variant="subtle"
          />
          <UButton
            v-if="supportsThermalPrint"
            :to="`/documents/${id}/print?profile=thermal`"
            icon="i-lucide-receipt"
            label="Imprimer thermique"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="document && customers && catalogItems" class="space-y-3">
        <PosDocumentDetailHeader
          :document="document"
          :paid-amount="paidAmount"
          :balance-due="balanceDue"
          :is-payable-document="isPayableDocument"
          @edit-context="openContextEditor"
        />

        <UTabs
          v-model="activeTab"
          :items="tabItems"
          value-key="value"
          variant="link"
          :content="false"
          class="w-full"
        />

        <div v-if="activeTab === 'lines'" class="grid gap-4 xl:h-[calc(100vh-18.5rem)]">
          <PosDocumentEditor
            v-if="customers && catalogItems"
            v-model:context-open="isContextOpen"
            :customers="customers"
            :catalog-items="catalogItems"
            :initial-value="document"
            :fixed-ticket-id="document.ticketId"
            submit-label="Enregistrer le document"
            @save="saveDocument"
          />
        </div>

        <div v-else-if="activeTab === 'payments'" class="grid gap-4 xl:h-[calc(100vh-18.5rem)] xl:grid-cols-[minmax(0,1fr)_18rem]">
          <PosDocumentPaymentsEditor
            :document-id="document.id"
            :payments="document.payments"
            :document-total="document.total"
            :balance-due="balanceDue"
            :is-payable-document="isPayableDocument"
            class="xl:col-span-2"
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
        <UFormField label="Destinataire" name="to" required>
          <UInput
            v-model="emailState.to"
            type="email"
            class="w-full"
            placeholder="client@example.com"
          />
        </UFormField>

        <UFormField label="Objet" name="subject" required>
          <UInput
            v-model="emailState.subject"
            class="w-full"
            placeholder="Votre facture FA-123"
          />
        </UFormField>

        <UFormField label="Message" name="message" required>
          <UTextarea
            v-model="emailState.message"
            :rows="8"
            class="w-full"
            autoresize
          />
        </UFormField>

        <div class="flex items-center justify-end gap-2">
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
            label="Envoyer"
            :loading="isSendingEmail"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
