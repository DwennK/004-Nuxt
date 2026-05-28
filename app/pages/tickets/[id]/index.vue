<script setup lang="ts">
import QRCode from 'qrcode'
import type { TableColumn } from '@nuxt/ui'
import {
  documentStatusColors,
  documentStatusLabels,
  documentTypeColors,
  documentTypeLabels,
  paymentMethodColors,
  paymentMethodLabels,
  ticketStatusColors,
  ticketStatusLabels,
  ticketTypeColors,
  ticketTypeLabels,
  ticketWorkflowStepLabels,
  ticketWorkflowSteps
} from '~~/shared/constants/pos'
import type {
  DocumentDetail,
  PaymentMethod,
  TicketDetail,
  TicketEvent,
  TicketStatus,
  TicketWorkflowAction
} from '~~/shared/types/pos'
import type { CustomerSmsSettingsRecord, SmsTemplateRecord } from '~~/shared/types/settings'
import {
  buildSmsHref,
  freeSmsTemplateId,
  normalizeSmsPhoneNumber,
  resolveSmsTemplateBody
} from '~~/shared/utils/customer-sms'
import { supportsDocumentPrintProfile, supportsTicketPrintProfile } from '~~/shared/utils/print'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

type TimelineItem = TicketEvent & {
  date: string
  title: string
  description: string
  icon: string
}

const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const NuxtLink = resolveComponent('NuxtLink')

const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))

const workflowOpen = ref(false)
const paymentOpen = ref(false)
const smsModalOpen = ref(false)
const createdDocumentActionsOpen = ref(false)
const selectedWorkflowAction = ref<TicketWorkflowAction | null>(null)
const createdCommercialDocument = ref<DocumentDetail | null>(null)
const selectedSmsTemplateId = ref<string>(freeSmsTemplateId)
const smsQrDataUrl = ref<string | null>(null)
const smsQrLoading = ref(false)
const smsLogKey = ref<string | null>(null)

const [{ data: ticket, refresh: refreshTicket }, { data: customerSmsSettings }] = await Promise.all([
  useFetch<TicketDetail>(() => `/api/tickets/${id.value}`),
  useFetch<CustomerSmsSettingsRecord>('/api/settings/customer-sms')
])

const activeTab = ref('suivi')

const operationalStatuses: TicketStatus[] = [
  'new',
  'diagnosis',
  'awaiting_customer_approval',
  'approved',
  'in_progress',
  'waiting_parts',
  'ready_for_pickup',
  'delivered'
]

const tabItems = computed(() => [
  { label: 'Suivi', icon: 'i-lucide-clock', value: 'suivi' },
  { label: 'Documents', icon: 'i-lucide-files', value: 'documents', badge: ticket.value?.documents.length || 0 },
  { label: 'Paiements', icon: 'i-lucide-wallet', value: 'payments', badge: ticket.value?.payments.length || 0 },
  { label: 'SMS', icon: 'i-lucide-message-square-share', value: 'sms', badge: smsTimelineItems.value.length || 0 },
  { label: 'Client & Appareil', icon: 'i-lucide-user', value: 'client' }
])

const workflowStepIndex = computed(() => {
  if (!ticket.value) {
    return 0
  }

  return ticketWorkflowSteps.indexOf(ticket.value.workflow.step)
})

const workflowStepItems = computed(() => ticketWorkflowSteps.map(step => ({
  title: ticketWorkflowStepLabels[step],
  description: step === ticket.value?.workflow.step ? ticket.value.workflow.currentStatusLabel : undefined,
  icon: step === ticket.value?.workflow.step ? 'i-lucide-circle-dot' : undefined
})))

const isTicketMutable = computed(() => ticket.value ? !['closed', 'cancelled'].includes(ticket.value.status) : false)
const canCreateQuote = computed(() => isTicketMutable.value && !ticket.value?.commercialSummary.quote)
const canCreateCustomerOrder = computed(() => isTicketMutable.value && !ticket.value?.commercialSummary.customerOrder)
const canCreateInvoice = computed(() => isTicketMutable.value && !ticket.value?.commercialSummary.invoice)
const payableDocument = computed(() => ticket.value?.commercialSummary.payableDocument || null)
const canRecordPayment = computed(() =>
  isTicketMutable.value
  && Boolean(payableDocument.value)
  && Boolean(ticket.value?.commercialSummary.balanceDue)
)
const supportsThermalPrint = supportsTicketPrintProfile('thermal')
const createdDocumentSupportsA4Print = computed(() =>
  createdCommercialDocument.value
    ? supportsDocumentPrintProfile(createdCommercialDocument.value.type, 'a4')
    : false
)
const createdDocumentSupportsThermalPrint = computed(() =>
  createdCommercialDocument.value
    ? supportsDocumentPrintProfile(createdCommercialDocument.value.type, 'thermal')
    : false
)
const canChargeCreatedDocument = computed(() =>
  createdCommercialDocument.value?.type === 'invoice'
  && Boolean(ticket.value?.commercialSummary.balanceDue)
)
const normalizedCustomerPhone = computed(() => normalizeSmsPhoneNumber(ticket.value?.customer.phone || ''))
const canSendSms = computed(() => Boolean(normalizedCustomerPhone.value))
const smsTemplates = computed(() => customerSmsSettings.value?.templates || [])
const smsTemplateItems = computed(() => [
  ...smsTemplates.value,
  {
    id: freeSmsTemplateId,
    label: 'Message libre',
    body: ''
  }
])
const selectedSmsTemplate = computed(() => smsTemplateItems.value.find(template => template.id === selectedSmsTemplateId.value) || smsTemplateItems.value[smsTemplateItems.value.length - 1] || null)
const resolvedSmsMessage = computed(() => {
  if (!ticket.value || !selectedSmsTemplate.value || selectedSmsTemplate.value.id === freeSmsTemplateId) {
    return ''
  }

  return resolveSmsTemplateBody(selectedSmsTemplate.value, {
    clientName: ticket.value.customer.displayName,
    ticketNumber: ticket.value.ticketNumber,
    brand: ticket.value.brand || '',
    model: ticket.value.model || ''
  })
})
const smsHref = computed(() => buildSmsHref(normalizedCustomerPhone.value, resolvedSmsMessage.value || null))
const smsButtonHelp = computed(() => canSendSms.value ? '' : 'Ajoutez un numero de telephone client pour generer un QR SMS.')

const statusMenuItems = computed(() => {
  if (!ticket.value || !isTicketMutable.value) {
    return []
  }

  const statusItems = operationalStatuses
    .filter(status => status !== ticket.value?.status)
    .map(status => ({
      label: ticketStatusLabels[status],
      color: ticketStatusColors[status],
      onSelect() {
        changeTicketStatus(status)
      }
    }))

  const finalItems: Array<{
    label: string
    icon: string
    color: 'success' | 'error'
    onSelect: () => void
  }> = [{
    label: 'Annuler le ticket',
    icon: 'i-lucide-circle-x',
    color: 'error',
    onSelect() {
      openWorkflowAction({
        id: 'cancel-ticket-inline',
        kind: 'status',
        label: 'Annuler le ticket',
        description: 'Le dossier est abandonné. Une confirmation explicite est requise.',
        icon: 'i-lucide-circle-x',
        color: 'error',
        targetStatus: 'cancelled'
      })
    }
  }]

  if (ticket.value.status === 'delivered') {
    finalItems.push({
      label: 'Clôturer le ticket',
      icon: 'i-lucide-check-check',
      color: 'success',
      onSelect() {
        openWorkflowAction({
          id: 'close-ticket-inline',
          kind: 'close',
          label: 'Clôturer le ticket',
          description: 'Le dossier est terminé et archivé.',
          icon: 'i-lucide-check-check',
          color: 'success',
          targetStatus: null
        })
      }
    })
  }

  return [
    statusItems,
    finalItems
  ]
})

const documentColumns: TableColumn<TicketDetail['documents'][number]>[] = [
  {
    accessorKey: 'documentNumber',
    header: 'Document',
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h(NuxtLink, { to: `/documents/${row.original.id}`, class: 'font-medium text-highlighted' }, () => row.original.documentNumber),
      h('div', { class: 'flex flex-wrap gap-2' }, [
        h(UBadge, { color: documentTypeColors[row.original.type], variant: 'subtle' }, () => documentTypeLabels[row.original.type]),
        h(UBadge, { color: documentStatusColors[row.original.status], variant: 'subtle' }, () => documentStatusLabels[row.original.status])
      ])
    ])
  },
  {
    accessorKey: 'issuedAt',
    header: 'Émis le',
    cell: ({ row }) => formatDateTime(row.original.issuedAt)
  },
  {
    accessorKey: 'total',
    header: 'Total TTC',
    cell: ({ row }) => formatCurrency(row.original.total)
  }
]

const paymentColumns: TableColumn<TicketDetail['payments'][number]>[] = [
  {
    accessorKey: 'method',
    header: 'Mode',
    cell: ({ row }) => h(UBadge, {
      color: paymentMethodColors[row.original.method],
      variant: 'subtle'
    }, () => paymentMethodLabels[row.original.method])
  },
  {
    accessorKey: 'amount',
    header: 'Montant',
    cell: ({ row }) => formatCurrency(row.original.amount)
  },
  {
    accessorKey: 'paidAt',
    header: 'Encaissé à',
    cell: ({ row }) => formatDateTime(row.original.paidAt)
  }
]

const timelineItems = computed<TimelineItem[]>(() => {
  return (ticket.value?.events || []).map(event => ({
    ...event,
    date: formatDateTime(event.occurredAt),
    title: event.label,
    description: getEventDescription(event),
    icon: getEventIcon(event.kind)
  }))
})

const smsTimelineItems = computed(() =>
  timelineItems.value.filter(event => event.kind === 'ticket_sms_qr_opened')
)

function getEventIcon(kind: TicketEvent['kind']) {
  switch (kind) {
    case 'ticket_created':
      return 'i-lucide-folder-plus'
    case 'ticket_status_changed':
      return 'i-lucide-workflow'
    case 'ticket_closed':
      return 'i-lucide-check-check'
    case 'document_created':
      return 'i-lucide-file-text'
    case 'payment_recorded':
      return 'i-lucide-wallet'
    case 'ticket_sms_qr_opened':
      return 'i-lucide-message-square-share'
  }
}

function getEventDescription(event: TicketEvent) {
  const metadata = event.metadata || {}

  if (event.kind === 'ticket_status_changed') {
    const previousStatus = typeof metadata.previousStatus === 'string' ? metadata.previousStatus : null
    const nextStatus = typeof metadata.nextStatus === 'string' ? metadata.nextStatus : null

    if (previousStatus && nextStatus) {
      return `${ticketStatusLabels[previousStatus as keyof typeof ticketStatusLabels]} → ${ticketStatusLabels[nextStatus as keyof typeof ticketStatusLabels]}`
    }

    return 'Le statut du ticket a été mis à jour.'
  }

  if (event.kind === 'ticket_created') {
    return 'Le dossier a été ouvert et pris en charge au comptoir.'
  }

  if (event.kind === 'ticket_closed') {
    return 'Le dossier est terminé et ne demande plus d\'action atelier.'
  }

  if (event.kind === 'document_created') {
    const documentNumber = typeof metadata.documentNumber === 'string' ? metadata.documentNumber : null
    const documentType = typeof metadata.documentType === 'string' ? metadata.documentType : null

    if (documentNumber && documentType && documentType in documentTypeLabels) {
      return `${documentTypeLabels[documentType as keyof typeof documentTypeLabels]} ${documentNumber}`
    }

    return 'Un document commercial a été lié au ticket.'
  }

  if (event.kind === 'payment_recorded') {
    const method = typeof metadata.method === 'string' ? metadata.method : null
    const amount = typeof metadata.amount === 'number' ? metadata.amount : null
    const documentNumber = typeof metadata.documentNumber === 'string' ? metadata.documentNumber : null
    const parts = []

    if (method && method in paymentMethodLabels) {
      parts.push(paymentMethodLabels[method as PaymentMethod])
    }

    if (typeof amount === 'number') {
      parts.push(formatCurrency(amount))
    }

    if (documentNumber) {
      parts.push(documentNumber)
    }

    return parts.join(' · ') || 'Un paiement a été enregistré.'
  }

  if (event.kind === 'ticket_sms_qr_opened') {
    const mode = event.metadata?.mode === 'free' ? 'Message libre' : 'Modèle'
    const templateLabel = typeof event.metadata?.templateLabel === 'string' ? event.metadata.templateLabel : 'SMS client'
    return `${mode} · ${templateLabel}`
  }

  return ''
}

function getEventDocumentId(event: TicketEvent) {
  const documentId = event.metadata?.documentId
  return typeof documentId === 'number' ? documentId : null
}

function openWorkflowAction(action: TicketWorkflowAction) {
  selectedWorkflowAction.value = action
  workflowOpen.value = true
}

function showCreatedDocumentActions(document: DocumentDetail) {
  createdCommercialDocument.value = document
  createdDocumentActionsOpen.value = true
}

function closeCreatedDocumentActions() {
  createdDocumentActionsOpen.value = false
}

function clearCreatedDocumentActions() {
  createdCommercialDocument.value = null
}

async function navigateToCreatedDocument(path: string) {
  closeCreatedDocumentActions()
  await navigateTo(path)
}

function openPaymentForCreatedDocument() {
  closeCreatedDocumentActions()
  paymentOpen.value = true
}

async function changeTicketStatus(status: TicketStatus, internalNotes?: string) {
  if (!ticket.value || ticket.value.status === status) {
    return
  }

  await $fetch(`/api/tickets/${id.value}/status`, {
    method: 'POST',
    body: {
      status,
      internalNotes: internalNotes ?? ticket.value.internalNotes
    }
  })

  toast.add({
    title: `Statut mis à jour · ${ticketStatusLabels[status]}`,
    color: 'success'
  })

  await refreshTicket()
}

async function handleWorkflowSubmit(payload: {
  action: TicketWorkflowAction
  internalNotes: string
}) {
  if (!ticket.value) {
    return
  }

  if (payload.action.kind === 'close') {
    await $fetch(`/api/tickets/${id.value}/close`, {
      method: 'POST',
      body: {
        internalNotes: payload.internalNotes
      }
    })

    toast.add({
      title: 'Ticket clôturé',
      color: 'success'
    })

    await refreshTicket()
  } else if (payload.action.targetStatus) {
    await changeTicketStatus(payload.action.targetStatus, payload.internalNotes)
  }

  workflowOpen.value = false
  selectedWorkflowAction.value = null
}

async function createQuote() {
  const document = await $fetch<DocumentDetail>(`/api/tickets/${id.value}/quote`, { method: 'POST' })

  toast.add({
    title: 'Devis créé',
    description: `Document #${document.documentNumber}`,
    color: 'success'
  })

  await refreshTicket()
  showCreatedDocumentActions(document)
}

async function createOrder() {
  const document = await $fetch<DocumentDetail>(`/api/tickets/${id.value}/order`, { method: 'POST' })

  toast.add({
    title: 'Commande créée',
    description: `Document #${document.documentNumber}`,
    color: 'success'
  })

  await refreshTicket()
  showCreatedDocumentActions(document)
}

async function createInvoice() {
  const document = await $fetch<DocumentDetail>(`/api/tickets/${id.value}/invoice`, { method: 'POST' })

  toast.add({
    title: 'Facture créée',
    description: `Document #${document.documentNumber}`,
    color: 'success'
  })

  await refreshTicket()
  showCreatedDocumentActions(document)
}

async function markPaid(payload: {
  method: PaymentMethod
  amount: number
  notes: string
}) {
  if (!payableDocument.value) {
    return
  }

  await $fetch(`/api/documents/${payableDocument.value.id}/mark-paid`, {
    method: 'POST',
    body: {
      ...payload,
      paidAt: new Date().toISOString()
    }
  })

  paymentOpen.value = false
  toast.add({
    title: 'Paiement enregistré',
    color: 'success'
  })
  await refreshTicket()
}

function openSmsModal() {
  selectedSmsTemplateId.value = freeSmsTemplateId
  smsLogKey.value = null
  smsModalOpen.value = true
}

async function selectSmsTemplate(template: SmsTemplateRecord) {
  selectedSmsTemplateId.value = template.id
  smsQrLoading.value = true

  try {
    smsQrDataUrl.value = await QRCode.toDataURL(smsHref.value || buildSmsHref(normalizedCustomerPhone.value), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320
    })

    const nextLogKey = `${template.id}:${resolvedSmsMessage.value || ''}:${normalizedCustomerPhone.value}`

    if (smsLogKey.value !== nextLogKey && ticket.value) {
      await $fetch(`/api/tickets/${id.value}/sms-qrcode`, {
        method: 'POST',
        body: {
          templateId: template.id === freeSmsTemplateId ? null : template.id,
          templateLabel: template.label,
          mode: template.id === freeSmsTemplateId ? 'free' : 'template'
        }
      })
      smsLogKey.value = nextLogKey
      await refreshTicket()
    }
  } finally {
    smsQrLoading.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="ticket-detail">
    <template #header>
      <UDashboardNavbar :title="ticket?.ticketNumber || 'Détail du ticket'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UDropdownMenu
            v-slot="{ open }"
            :items="statusMenuItems"
            :content="{ align: 'end', side: 'bottom' }"
            :disabled="!isTicketMutable"
            :ui="{ content: 'min-w-64' }"
          >
            <UButton
              :label="ticket?.workflow.currentStatusLabel || 'Statut'"
              :color="ticket ? ticketStatusColors[ticket.status] : 'neutral'"
              variant="subtle"
              trailing-icon="i-lucide-chevron-down"
              :disabled="!isTicketMutable"
              :ui="{
                trailingIcon: ['transition-transform duration-200', open ? 'rotate-180' : undefined].filter(Boolean).join(' ')
              }"
            />
          </UDropdownMenu>

          <UButton
            label="SMS client"
            icon="i-lucide-message-square-share"
            color="neutral"
            variant="subtle"
            :disabled="!canSendSms"
            @click="openSmsModal"
          />
          <UButton
            v-if="supportsThermalPrint"
            :to="`/tickets/${id}/print`"
            label="Imprimer ticket atelier"
            icon="i-lucide-printer"
            color="neutral"
            variant="subtle"
          />
          <UButton
            label="Modifier le ticket"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            :to="`/tickets/${id}/edit`"
            :disabled="!isTicketMutable"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="ticket" class="space-y-3">
        <UAlert
          v-if="!canSendSms"
          color="neutral"
          variant="soft"
          icon="i-lucide-message-square-warning"
          title="SMS client indisponible"
          :description="smsButtonHelp"
        />

        <!-- Compact summary band -->
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div class="flex items-center gap-3">
            <h1 class="text-xl font-semibold text-highlighted">
              {{ ticket.brand || 'Appareil' }} {{ ticket.model || '' }}
            </h1>
            <div class="flex items-center gap-1.5">
              <UBadge :color="ticketTypeColors[ticket.type]" variant="subtle" size="sm">
                {{ ticketTypeLabels[ticket.type] }}
              </UBadge>
            </div>
          </div>

          <USeparator orientation="vertical" class="hidden h-5 xl:block" />

          <div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span class="text-toned">
              {{ ticket.workflow.nextActionLabel }}
            </span>
            <span class="text-toned">
              {{ ticket.commercialSummary.paymentStateLabel }}
            </span>
            <span class="font-medium text-highlighted">
              {{ formatCurrency(ticket.commercialSummary.totalPaid) }} encaissé
            </span>
            <span v-if="ticket.commercialSummary.balanceDue" class="font-medium text-warning">
              {{ formatCurrency(ticket.commercialSummary.balanceDue) }} restant
            </span>
          </div>
        </div>

        <p class="line-clamp-2 text-sm text-toned">
          {{ ticket.issueDescription }}
        </p>

        <UAlert
          v-if="ticket.workflow.blockerLabel"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :title="ticket.workflow.blockerLabel"
        />

        <UStepper
          :items="workflowStepItems"
          :default-value="workflowStepIndex"
          disabled
          color="primary"
          size="sm"
        />

        <!-- Main two-column layout -->
        <div class="grid items-start gap-4 xl:h-[calc(100vh-19rem)] xl:grid-cols-[minmax(0,1fr)_18rem]">
          <!-- Left: tabbed content -->
          <div class="xl:min-h-0">
            <UTabs
              v-model="activeTab"
              :items="tabItems"
              variant="link"
              :content="false"
            />

            <div class="mt-4 xl:h-[calc(100vh-23rem)]">
              <!-- Suivi tab -->
              <div v-if="activeTab === 'suivi'" class="xl:h-full xl:overflow-y-auto pr-1">
                <UTimeline
                  :items="timelineItems"
                  color="primary"
                >
                  <template #wrapper="{ item: event }">
                    <div class="space-y-2 rounded-xl border border-default bg-default p-3">
                      <div class="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p class="text-sm font-medium text-highlighted">
                            {{ event.title }}
                          </p>
                          <p class="text-xs text-toned">
                            {{ event.date }}
                          </p>
                        </div>
                        <UBadge
                          v-if="event.isSynthetic"
                          color="neutral"
                          variant="outline"
                          size="xs"
                        >
                          Reconstruit
                        </UBadge>
                      </div>

                      <p class="text-sm text-toned">
                        {{ event.description }}
                      </p>

                      <div v-if="event.note" class="rounded-lg border border-default bg-muted/30 px-3 py-2">
                        <p class="text-xs text-toned">
                          Note
                        </p>
                        <p class="text-sm text-highlighted">
                          {{ event.note }}
                        </p>
                      </div>

                      <UButton
                        v-if="getEventDocumentId(event)"
                        :to="`/documents/${getEventDocumentId(event)}`"
                        label="Ouvrir le document"
                        icon="i-lucide-arrow-up-right"
                        size="xs"
                        color="neutral"
                        variant="soft"
                      />
                    </div>
                  </template>
                </UTimeline>
              </div>

              <!-- Documents tab -->
              <div v-else-if="activeTab === 'documents'" class="xl:h-full">
                <UCard :ui="{ body: 'p-4', header: 'p-4 pb-0' }" class="xl:min-h-0">
                  <template #header>
                    <div class="flex items-center justify-between gap-3">
                      <h3 class="text-sm font-medium text-highlighted">
                        Documents liés
                      </h3>
                      <span class="text-xs text-toned">
                        {{ ticket.documents.length }} document(s)
                      </span>
                    </div>
                  </template>

                  <div class="xl:max-h-[calc(100vh-28rem)] xl:overflow-auto pr-1">
                    <UTable :data="ticket.documents" :columns="documentColumns" sticky="header">
                      <template #empty>
                        <UEmpty
                          icon="i-lucide-files"
                          title="Aucun document lié"
                          description="Créez un devis, une commande ou une facture depuis les actions."
                        />
                      </template>
                    </UTable>
                  </div>
                </UCard>
              </div>

              <!-- Payments tab -->
              <div v-else-if="activeTab === 'payments'" class="xl:h-full">
                <UCard :ui="{ body: 'p-4', header: 'p-4 pb-0' }" class="xl:min-h-0">
                  <template #header>
                    <div class="flex items-center justify-between gap-3">
                      <h3 class="text-sm font-medium text-highlighted">
                        Paiements
                      </h3>
                      <span class="text-xs text-toned">
                        {{ ticket.payments.length }} paiement(s)
                      </span>
                    </div>
                  </template>

                  <div class="xl:max-h-[calc(100vh-28rem)] xl:overflow-auto pr-1">
                    <UTable :data="ticket.payments" :columns="paymentColumns" sticky="header">
                      <template #empty>
                        <UEmpty
                          icon="i-lucide-wallet"
                          title="Aucun paiement"
                          description="Les paiements enregistrés apparaîtront ici."
                        />
                      </template>
                    </UTable>
                  </div>
                </UCard>
              </div>

              <!-- SMS tab -->
              <div v-else-if="activeTab === 'sms'" class="grid gap-4 xl:h-full xl:grid-cols-[minmax(0,1fr)_18rem]">
                <UCard :ui="{ body: 'p-4', header: 'p-4 pb-0' }" class="xl:min-h-0">
                  <template #header>
                    <div class="flex items-center justify-between gap-3">
                      <h3 class="text-sm font-medium text-highlighted">
                        Historique QR SMS
                      </h3>
                      <span class="text-xs text-toned">
                        {{ smsTimelineItems.length }} événement(s)
                      </span>
                    </div>
                  </template>

                  <div v-if="smsTimelineItems.length" class="space-y-3 xl:max-h-[calc(100vh-28rem)] xl:overflow-y-auto pr-1">
                    <div
                      v-for="event in smsTimelineItems"
                      :key="event.id"
                      class="space-y-2 rounded-xl border border-default bg-default p-3"
                    >
                      <div class="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p class="text-sm font-medium text-highlighted">
                            {{ event.title }}
                          </p>
                          <p class="text-xs text-toned">
                            {{ event.date }}
                          </p>
                        </div>
                      </div>

                      <p class="text-sm text-toned">
                        {{ event.description }}
                      </p>

                      <div v-if="event.note" class="rounded-lg border border-default bg-muted/30 px-3 py-2">
                        <p class="text-xs text-toned">
                          Note
                        </p>
                        <p class="text-sm text-highlighted">
                          {{ event.note }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <UEmpty
                    v-else
                    icon="i-lucide-message-square-share"
                    title="Aucun QR SMS affiché"
                    description="Les ouvertures du flux SMS client apparaîtront ici."
                    class="py-12"
                  />
                </UCard>

                <UCard :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }" class="xl:min-h-0">
                  <template #header>
                    <div class="flex items-center justify-between gap-3">
                      <h3 class="text-sm font-medium text-highlighted">
                        SMS client
                      </h3>
                    </div>
                  </template>

                  <div class="rounded-xl border border-default bg-default/80 px-3 py-3">
                    <p class="text-xs uppercase tracking-[0.14em] text-toned">
                      Numéro client
                    </p>
                    <p class="mt-2 font-medium text-highlighted">
                      {{ ticket.customer.phone || 'Pas de téléphone' }}
                    </p>
                    <p class="mt-1 text-xs text-toned">
                      {{ canSendSms ? 'Le QR ouvre l’app Messages sur l’iPhone de comptoir.' : smsButtonHelp }}
                    </p>
                  </div>

                  <div class="rounded-xl border border-default bg-default/80 px-3 py-3">
                    <p class="text-xs uppercase tracking-[0.14em] text-toned">
                      Modèles configurés
                    </p>
                    <p class="mt-2 font-medium text-highlighted">
                      {{ smsTemplates.length }} modèle(s)
                    </p>
                    <p class="mt-1 text-xs text-toned">
                      Message libre disponible en plus des modèles enregistrés.
                    </p>
                  </div>

                  <UButton
                    label="Ouvrir le flux SMS"
                    icon="i-lucide-message-square-share"
                    color="neutral"
                    variant="soft"
                    block
                    :disabled="!canSendSms"
                    @click="openSmsModal"
                  />
                </UCard>
              </div>

              <!-- Client tab -->
              <div v-else-if="activeTab === 'client'" class="space-y-4 text-sm xl:h-full xl:overflow-y-auto pr-1">
                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="rounded-xl border border-default p-4">
                    <p class="text-xs uppercase tracking-[0.14em] text-toned">
                      Client
                    </p>
                    <p class="mt-2 font-medium text-highlighted">
                      {{ ticket.customer.displayName }}
                    </p>
                    <p class="text-toned">
                      {{ ticket.customer.phone || 'Pas de téléphone' }}
                    </p>
                    <p class="text-toned">
                      {{ ticket.customer.email || 'Pas d\'e-mail' }}
                    </p>
                  </div>

                  <div class="rounded-xl border border-default p-4">
                    <p class="text-xs uppercase tracking-[0.14em] text-toned">
                      Appareil
                    </p>
                    <p class="mt-2 font-medium text-highlighted">
                      {{ ticket.brand || 'Marque ?' }} {{ ticket.model || '' }}
                    </p>
                    <div class="mt-1 space-y-0.5 text-toned">
                      <p>IMEI: {{ ticket.imei || '—' }}</p>
                      <p>S/N: {{ ticket.serialNumber || '—' }}</p>
                      <p>Accès: {{ ticket.accessCode || '—' }}</p>
                      <p>SIM: {{ ticket.simCode || '—' }}</p>
                    </div>
                  </div>
                </div>

                <div class="flex gap-4 text-xs text-toned">
                  <span>Ouvert le {{ formatDateTime(ticket.openedAt) }}</span>
                  <span>MAJ {{ formatDateTime(ticket.updatedAt) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: compact sticky sidebar -->
          <div class="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-19rem)] xl:overflow-y-auto pr-1">
            <!-- Commercial -->
            <UCard
              :ui="{
                root: 'rounded-[1.5rem] border border-default/80 bg-elevated/50 shadow-sm',
                header: 'border-b border-default/70 px-4 py-3',
                body: 'space-y-4 p-4'
              }"
            >
              <template #header>
                <h2 class="text-sm font-semibold text-highlighted">
                  Commercial
                </h2>
              </template>

              <div class="space-y-2">
                <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-toned">
                  Documents
                </p>

                <div class="space-y-2 text-sm">
                  <div class="flex items-center justify-between gap-3 rounded-xl border border-default/70 bg-default/80 px-3 py-2.5">
                    <div class="min-w-0">
                      <p class="text-xs text-toned">
                        Devis
                      </p>
                      <p class="truncate font-medium text-highlighted">
                        {{ ticket.commercialSummary.quote?.documentNumber || '—' }}
                      </p>
                    </div>
                    <UButton
                      v-if="ticket.commercialSummary.quote"
                      :to="`/documents/${ticket.commercialSummary.quote.id}`"
                      label="Ouvrir"
                      icon="i-lucide-arrow-up-right"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                    />
                  </div>

                  <div class="flex items-center justify-between gap-3 rounded-xl border border-default/70 bg-default/80 px-3 py-2.5">
                    <div class="min-w-0">
                      <p class="text-xs text-toned">
                        Commande
                      </p>
                      <p class="truncate font-medium text-highlighted">
                        {{ ticket.commercialSummary.customerOrder?.documentNumber || '—' }}
                      </p>
                    </div>
                    <UButton
                      v-if="ticket.commercialSummary.customerOrder"
                      :to="`/documents/${ticket.commercialSummary.customerOrder.id}`"
                      label="Ouvrir"
                      icon="i-lucide-arrow-up-right"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                    />
                  </div>

                  <div class="flex items-center justify-between gap-3 rounded-xl border border-default/70 bg-default/80 px-3 py-2.5">
                    <div class="min-w-0">
                      <p class="text-xs text-toned">
                        Facture
                      </p>
                      <p class="truncate font-medium text-highlighted">
                        {{ ticket.commercialSummary.invoice?.documentNumber || '—' }}
                      </p>
                    </div>
                    <UButton
                      v-if="ticket.commercialSummary.invoice"
                      :to="`/documents/${ticket.commercialSummary.invoice.id}`"
                      label="Ouvrir"
                      icon="i-lucide-arrow-up-right"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                    />
                  </div>
                </div>
              </div>

              <div class="border-t border-default/70 pt-4 space-y-2">
                <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-toned">
                  Actions
                </p>
                <UButton
                  v-if="canCreateQuote"
                  label="Créer un devis"
                  icon="i-lucide-scroll-text"
                  variant="soft"
                  size="md"
                  block
                  class="justify-start rounded-xl"
                  @click="createQuote"
                />
                <UButton
                  v-if="canCreateCustomerOrder"
                  label="Créer une commande"
                  icon="i-lucide-clipboard-plus"
                  color="warning"
                  variant="soft"
                  size="md"
                  block
                  class="justify-start rounded-xl"
                  @click="createOrder"
                />
                <UButton
                  v-if="canCreateInvoice"
                  label="Créer une facture"
                  icon="i-lucide-file-text"
                  size="md"
                  block
                  class="justify-start rounded-xl"
                  @click="createInvoice"
                />
                <UButton
                  v-if="canRecordPayment"
                  label="Encaisser"
                  icon="i-lucide-wallet"
                  color="success"
                  variant="soft"
                  size="md"
                  block
                  class="justify-start rounded-xl"
                  @click="paymentOpen = true"
                />
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <UModal
    v-if="createdCommercialDocument"
    v-model:open="createdDocumentActionsOpen"
    :title="`${documentTypeLabels[createdCommercialDocument.type]} créé`"
    :description="`${createdCommercialDocument.documentNumber} est lié au ticket ${ticket?.ticketNumber || ''}.`"
    :ui="{ content: 'sm:max-w-2xl' }"
    @after:leave="clearCreatedDocumentActions"
  >
    <template #body>
      <div class="space-y-4">
        <div class="rounded-2xl border border-success/20 bg-success/5 px-4 py-4">
          <div class="flex items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
              <UIcon name="i-lucide-file-check-2" class="size-5" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium text-highlighted">
                {{ documentTypeLabels[createdCommercialDocument.type] }} {{ createdCommercialDocument.documentNumber }}
              </p>
              <p class="mt-1 text-sm text-toned">
                {{ createdCommercialDocument.customer.displayName }} · {{ formatCurrency(createdCommercialDocument.total) }}
              </p>
            </div>
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <UButton
            label="Ouvrir le document"
            icon="i-lucide-arrow-up-right"
            color="primary"
            block
            @click="navigateToCreatedDocument(`/documents/${createdCommercialDocument.id}`)"
          />
          <UButton
            v-if="createdDocumentSupportsA4Print"
            label="Envoyer par mail"
            icon="i-lucide-mail"
            color="neutral"
            variant="soft"
            block
            @click="navigateToCreatedDocument(`/documents/${createdCommercialDocument.id}?email=1`)"
          />
          <UButton
            v-if="createdDocumentSupportsA4Print"
            label="Imprimer A4"
            icon="i-lucide-file-text"
            color="neutral"
            variant="soft"
            block
            @click="navigateToCreatedDocument(`/documents/${createdCommercialDocument.id}/print?profile=a4`)"
          />
          <UButton
            v-if="createdDocumentSupportsThermalPrint"
            label="Imprimer thermique"
            icon="i-lucide-printer"
            color="neutral"
            variant="soft"
            block
            @click="navigateToCreatedDocument(`/documents/${createdCommercialDocument.id}/print?profile=thermal`)"
          />
          <UButton
            v-if="createdCommercialDocument.type !== 'invoice' && canCreateInvoice"
            label="Créer la facture"
            icon="i-lucide-file-text"
            color="neutral"
            variant="soft"
            block
            @click="createInvoice"
          />
          <UButton
            v-if="canChargeCreatedDocument"
            label="Encaisser"
            icon="i-lucide-wallet"
            color="success"
            variant="soft"
            block
            @click="openPaymentForCreatedDocument"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end">
        <UButton
          label="Rester sur le ticket"
          color="neutral"
          variant="ghost"
          @click="closeCreatedDocumentActions"
        />
      </div>
    </template>
  </UModal>

  <PosTicketWorkflowSlideover
    v-model:open="workflowOpen"
    :action="selectedWorkflowAction"
    :initial-notes="ticket?.internalNotes"
    @submit="handleWorkflowSubmit"
  />

  <PosDocumentPaymentSlideover
    v-if="payableDocument"
    v-model:open="paymentOpen"
    :balance-due="ticket?.commercialSummary.balanceDue || 0"
    @save="markPaid"
  />

  <UModal
    v-model:open="smsModalOpen"
    title="SMS client"
    :description="ticket?.customer.phone ? `Scanner le QR avec l’iPhone pour ouvrir l’app Messages vers ${ticket.customer.displayName}.` : 'Ajoutez un numero de telephone pour utiliser ce flux.'"
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
