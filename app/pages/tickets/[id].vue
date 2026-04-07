<script setup lang="ts">
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
  CustomerRecord,
  DocumentDetail,
  PaymentMethod,
  TicketDetail,
  TicketEvent,
  TicketStatus,
  TicketWorkflowAction
} from '~~/shared/types/pos'
import { supportsTicketPrintProfile } from '~~/shared/utils/print'
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
const editOpen = ref(false)
const selectedWorkflowAction = ref<TicketWorkflowAction | null>(null)

const [{ data: ticket, refresh: refreshTicket }, { data: customers }] = await Promise.all([
  useFetch<TicketDetail>(() => `/api/tickets/${id.value}`),
  useFetch<CustomerRecord[]>('/api/customers')
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
  },
  {
    accessorKey: 'reference',
    header: 'Référence',
    cell: ({ row }) => row.original.reference || 'Aucune référence'
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
}

async function createOrder() {
  const document = await $fetch<DocumentDetail>(`/api/tickets/${id.value}/order`, { method: 'POST' })

  toast.add({
    title: 'Commande créée',
    description: `Document #${document.documentNumber}`,
    color: 'success'
  })

  await refreshTicket()
}

async function createInvoice() {
  const document = await $fetch<DocumentDetail>(`/api/tickets/${id.value}/invoice`, { method: 'POST' })

  toast.add({
    title: 'Facture créée',
    description: `Document #${document.documentNumber}`,
    color: 'success'
  })

  await refreshTicket()
}

async function markPaid(payload: {
  method: PaymentMethod
  amount: number
  reference: string
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

async function saveTicket(payload: {
  customerId: number
  type: 'repair' | 'support'
  status: TicketDetail['status']
  brand: string
  model: string
  serialNumber: string
  imei: string
  accessCode: string
  simCode: string
  issueDescription: string
  internalNotes: string
  openedAt: string
  closedAt: string
}) {
  await $fetch(`/api/tickets/${id.value}`, {
    method: 'PATCH',
    body: payload
  })

  toast.add({
    title: 'Ticket mis à jour',
    color: 'success'
  })

  await refreshTicket()
  editOpen.value = false
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
            @click="editOpen = !editOpen"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="ticket" class="space-y-3">
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
              <div v-else-if="activeTab === 'documents'" class="grid gap-4 xl:h-full xl:grid-cols-[minmax(0,1fr)_18rem]">
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
            <UCard :ui="{ body: 'p-3 sm:p-3 space-y-2' }">
              <template #header>
                <h2 class="text-sm font-semibold text-highlighted">
                  Commercial
                </h2>
              </template>

              <div class="space-y-2 text-sm">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs text-toned">
                      Devis
                    </p>
                    <p class="font-medium text-highlighted">
                      {{ ticket.commercialSummary.quote?.documentNumber || '—' }}
                    </p>
                  </div>
                  <UButton
                    v-if="ticket.commercialSummary.quote"
                    :to="`/documents/${ticket.commercialSummary.quote.id}`"
                    icon="i-lucide-arrow-up-right"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                  />
                </div>

                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs text-toned">
                      Commande
                    </p>
                    <p class="font-medium text-highlighted">
                      {{ ticket.commercialSummary.customerOrder?.documentNumber || '—' }}
                    </p>
                  </div>
                  <UButton
                    v-if="ticket.commercialSummary.customerOrder"
                    :to="`/documents/${ticket.commercialSummary.customerOrder.id}`"
                    icon="i-lucide-arrow-up-right"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                  />
                </div>

                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs text-toned">
                      Facture
                    </p>
                    <p class="font-medium text-highlighted">
                      {{ ticket.commercialSummary.invoice?.documentNumber || '—' }}
                    </p>
                  </div>
                  <UButton
                    v-if="ticket.commercialSummary.invoice"
                    :to="`/documents/${ticket.commercialSummary.invoice.id}`"
                    icon="i-lucide-arrow-up-right"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                  />
                </div>
              </div>

              <div class="space-y-1.5">
                <UButton
                  v-if="canCreateQuote"
                  label="Créer un devis"
                  icon="i-lucide-scroll-text"
                  variant="soft"
                  size="sm"
                  block
                  class="justify-start"
                  @click="createQuote"
                />
                <UButton
                  v-if="canCreateCustomerOrder"
                  label="Créer une commande"
                  icon="i-lucide-clipboard-plus"
                  color="warning"
                  variant="soft"
                  size="sm"
                  block
                  class="justify-start"
                  @click="createOrder"
                />
                <UButton
                  v-if="canCreateInvoice"
                  label="Créer une facture"
                  icon="i-lucide-receipt"
                  size="sm"
                  block
                  class="justify-start"
                  @click="createInvoice"
                />
                <UButton
                  v-if="canRecordPayment"
                  label="Encaisser"
                  icon="i-lucide-wallet"
                  color="success"
                  variant="soft"
                  size="sm"
                  block
                  class="justify-start"
                  @click="paymentOpen = true"
                />
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

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

  <USlideover
    v-model:open="editOpen"
    title="Modifier le ticket"
    description="Modifier les informations du ticket."
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <PosTicketForm
        v-if="ticket"
        :customers="customers || []"
        :initial-value="ticket"
        submit-label="Enregistrer les modifications"
        @save="saveTicket"
      />
    </template>
  </USlideover>
</template>
