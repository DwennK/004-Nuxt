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
  TicketWorkflowAction
} from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

type TimelineItem = TicketEvent & {
  date: string
  title: string
  description: string
  icon: string
}

const UBadge = resolveComponent('UBadge')
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
const canCreateInvoice = computed(() => isTicketMutable.value && !ticket.value?.commercialSummary.invoice)
const payableDocument = computed(() => ticket.value?.commercialSummary.payableDocument || null)
const canRecordPayment = computed(() =>
  isTicketMutable.value
  && Boolean(payableDocument.value)
  && Boolean(ticket.value?.commercialSummary.balanceDue)
)

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
    return 'Le dossier est terminé et ne demande plus d’action atelier.'
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
  } else if (payload.action.targetStatus) {
    await $fetch(`/api/tickets/${id.value}/status`, {
      method: 'POST',
      body: {
        status: payload.action.targetStatus,
        internalNotes: payload.internalNotes
      }
    })

    toast.add({
      title: payload.action.label,
      color: 'success'
    })
  }

  workflowOpen.value = false
  selectedWorkflowAction.value = null
  await refreshTicket()
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
      <div v-if="ticket" class="space-y-6">
        <UCard
          variant="subtle"
          :ui="{
            root: 'rounded-3xl',
            body: 'space-y-5 p-5 sm:p-6'
          }"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :color="ticketTypeColors[ticket.type]" variant="subtle">
                  {{ ticketTypeLabels[ticket.type] }}
                </UBadge>
                <UBadge :color="ticketStatusColors[ticket.status]" variant="subtle">
                  {{ ticket.workflow.currentStatusLabel }}
                </UBadge>
                <UBadge color="neutral" variant="outline">
                  Étape · {{ ticket.workflow.stepLabel }}
                </UBadge>
              </div>

              <div class="space-y-1">
                <h1 class="text-2xl font-semibold text-highlighted">
                  {{ ticket.brand || 'Appareil à préciser' }} {{ ticket.model || '' }}
                </h1>
                <p class="text-sm text-toned">
                  {{ ticket.issueDescription }}
                </p>
              </div>

              <UAlert
                v-if="ticket.workflow.blockerLabel"
                color="warning"
                variant="soft"
                icon="i-lucide-triangle-alert"
                :title="ticket.workflow.blockerLabel"
                description="Le ticket demande une action explicite avant de poursuivre normalement."
              />
            </div>

            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div class="rounded-2xl border border-default bg-default px-4 py-3">
                <p class="text-xs uppercase tracking-[0.14em] text-toned">
                  Prochaine action
                </p>
                <p class="mt-2 text-sm font-medium text-highlighted">
                  {{ ticket.workflow.nextActionLabel }}
                </p>
              </div>

              <div class="rounded-2xl border border-default bg-default px-4 py-3">
                <p class="text-xs uppercase tracking-[0.14em] text-toned">
                  État commercial
                </p>
                <p class="mt-2 text-sm font-medium text-highlighted">
                  {{ ticket.commercialSummary.paymentStateLabel }}
                </p>
              </div>

              <div class="rounded-2xl border border-default bg-default px-4 py-3">
                <p class="text-xs uppercase tracking-[0.14em] text-toned">
                  Encaissé
                </p>
                <p class="mt-2 text-sm font-medium text-highlighted">
                  {{ formatCurrency(ticket.commercialSummary.totalPaid) }}
                </p>
              </div>

              <div class="rounded-2xl border border-default bg-default px-4 py-3">
                <p class="text-xs uppercase tracking-[0.14em] text-toned">
                  Restant
                </p>
                <p class="mt-2 text-sm font-medium text-highlighted">
                  {{ formatCurrency(ticket.commercialSummary.balanceDue) }}
                </p>
              </div>
            </div>
          </div>

          <UStepper
            :items="workflowStepItems"
            :default-value="workflowStepIndex"
            disabled
            color="primary"
          />
        </UCard>

        <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_24rem]">
          <div class="space-y-6">
            <UCard :ui="{ body: 'space-y-5 p-5 sm:p-6' }">
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Historique du dossier
                  </h2>
                  <p class="text-sm text-toned">
                    Le ticket raconte maintenant ce qui s’est passé et pas seulement son statut courant.
                  </p>
                </div>
              </template>

              <UTimeline
                :items="timelineItems"
                color="primary"
              >
                <template #wrapper="{ item }">
                  <div class="space-y-2 rounded-2xl border border-default bg-default p-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="space-y-1">
                        <p class="font-medium text-highlighted">
                          {{ item.title }}
                        </p>
                        <p class="text-xs uppercase tracking-[0.14em] text-toned">
                          {{ item.date }}
                        </p>
                      </div>

                      <UBadge
                        v-if="item.isSynthetic"
                        color="neutral"
                        variant="outline"
                        size="sm"
                      >
                        Historique reconstruit
                      </UBadge>
                    </div>

                    <p class="text-sm text-toned">
                      {{ item.description }}
                    </p>

                    <div v-if="item.note" class="rounded-xl border border-default bg-muted/30 p-3">
                      <p class="text-xs uppercase tracking-[0.14em] text-toned">
                        Note
                      </p>
                      <p class="mt-1 text-sm text-highlighted">
                        {{ item.note }}
                      </p>
                    </div>

                    <UButton
                      v-if="getEventDocumentId(item)"
                      :to="`/documents/${getEventDocumentId(item)}`"
                      label="Ouvrir le document"
                      icon="i-lucide-arrow-up-right"
                      size="sm"
                      color="neutral"
                      variant="soft"
                    />
                  </div>
                </template>
              </UTimeline>
            </UCard>

            <div class="grid gap-6 xl:grid-cols-2">
              <UCard>
                <template #header>
                  <div>
                    <h2 class="text-lg font-semibold text-highlighted">
                      Documents liés
                    </h2>
                    <p class="text-sm text-toned">
                      Le devis et la facture restent séparés, mais leur état reste visible depuis le ticket.
                    </p>
                  </div>
                </template>

                <UTable :data="ticket.documents" :columns="documentColumns" sticky="header">
                  <template #empty>
                    <UEmpty
                      icon="i-lucide-files"
                      title="Aucun document lié"
                      description="Créez un devis ou une facture depuis la colonne d’actions."
                    />
                  </template>
                </UTable>
              </UCard>

              <UCard>
                <template #header>
                  <div>
                    <h2 class="text-lg font-semibold text-highlighted">
                      Paiements liés
                    </h2>
                    <p class="text-sm text-toned">
                      Les encaissements du dossier apparaissent directement dans la même vue.
                    </p>
                  </div>
                </template>

                <UTable :data="ticket.payments" :columns="paymentColumns" sticky="header">
                  <template #empty>
                    <UEmpty
                      icon="i-lucide-wallet"
                      title="Aucun paiement lié"
                      description="Les paiements enregistrés sur les documents liés apparaîtront ici."
                    />
                  </template>
                </UTable>
              </UCard>
            </div>

            <UCard v-if="editOpen">
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Modifier les informations du ticket
                  </h2>
                  <p class="text-sm text-toned">
                    Édition détaillée du ticket, séparée de la lecture opérationnelle du dossier.
                  </p>
                </div>
              </template>

              <PosTicketForm
                :customers="customers || []"
                :initial-value="ticket"
                submit-label="Enregistrer les modifications"
                @save="saveTicket"
              />
            </UCard>
          </div>

          <div class="space-y-6 xl:sticky xl:top-4">
            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Actions du ticket
                  </h2>
                  <p class="text-sm text-toned">
                    Les prochaines actions utiles dépendent du statut courant et de l’état commercial du dossier.
                  </p>
                </div>
              </template>

              <div class="space-y-3">
                <template v-if="ticket.workflow.actions.length">
                  <UButton
                    v-for="action in ticket.workflow.actions"
                    :key="action.id"
                    :label="action.label"
                    :description="action.description"
                    :icon="action.icon"
                    :color="action.color"
                    variant="soft"
                    block
                    class="justify-start"
                    @click="openWorkflowAction(action)"
                  />
                </template>

                <UAlert
                  v-else
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-check-check"
                  title="Aucune action de suivi"
                  description="Le ticket n’a plus de progression atelier disponible."
                />
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Dossier commercial
                  </h2>
                </div>
              </template>

              <div class="space-y-3">
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-[0.14em] text-toned">
                    Devis courant
                  </p>
                  <div class="mt-2 flex items-center justify-between gap-3">
                    <div>
                      <p class="font-medium text-highlighted">
                        {{ ticket.commercialSummary.quote?.documentNumber || 'Aucun devis' }}
                      </p>
                      <p class="text-sm text-toned">
                        {{ ticket.commercialSummary.quote ? documentStatusLabels[ticket.commercialSummary.quote.status] : 'Pas encore créé' }}
                      </p>
                    </div>
                    <UButton
                      v-if="ticket.commercialSummary.quote"
                      :to="`/documents/${ticket.commercialSummary.quote.id}`"
                      icon="i-lucide-arrow-up-right"
                      color="neutral"
                      variant="ghost"
                    />
                  </div>
                </div>

                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-[0.14em] text-toned">
                    Facture courante
                  </p>
                  <div class="mt-2 flex items-center justify-between gap-3">
                    <div>
                      <p class="font-medium text-highlighted">
                        {{ ticket.commercialSummary.invoice?.documentNumber || 'Aucune facture' }}
                      </p>
                      <p class="text-sm text-toned">
                        {{ ticket.commercialSummary.invoice ? `${documentStatusLabels[ticket.commercialSummary.invoice.status]} · ${formatCurrency(ticket.commercialSummary.invoice.total)}` : 'Pas encore émise' }}
                      </p>
                    </div>
                    <UButton
                      v-if="ticket.commercialSummary.invoice"
                      :to="`/documents/${ticket.commercialSummary.invoice.id}`"
                      icon="i-lucide-arrow-up-right"
                      color="neutral"
                      variant="ghost"
                    />
                  </div>
                </div>

                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <UButton
                    v-if="canCreateQuote"
                    label="Créer un devis"
                    icon="i-lucide-scroll-text"
                    variant="soft"
                    block
                    class="justify-start"
                    @click="createQuote"
                  />

                  <UButton
                    v-if="canCreateInvoice"
                    label="Créer une facture"
                    icon="i-lucide-receipt"
                    block
                    class="justify-start"
                    @click="createInvoice"
                  />

                  <UButton
                    v-if="canRecordPayment"
                    label="Enregistrer un paiement"
                    icon="i-lucide-wallet"
                    color="success"
                    variant="soft"
                    block
                    class="justify-start"
                    @click="paymentOpen = true"
                  />

                  <UButton
                    v-if="ticket.commercialSummary.latestDocument"
                    :to="`/documents/${ticket.commercialSummary.latestDocument.id}`"
                    label="Ouvrir le dernier document"
                    icon="i-lucide-arrow-up-right"
                    color="neutral"
                    variant="ghost"
                    block
                    class="justify-start"
                  />
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Client et appareil
                  </h2>
                </div>
              </template>

              <div class="space-y-4 text-sm text-toned">
                <div>
                  <p class="font-medium text-highlighted">
                    {{ ticket.customer.displayName }}
                  </p>
                  <p>{{ ticket.customer.phone || 'Téléphone non renseigné' }}</p>
                  <p>{{ ticket.customer.email || 'E-mail non renseigné' }}</p>
                </div>

                <div class="rounded-2xl border border-default bg-muted/20 p-4">
                  <p class="font-medium text-highlighted">
                    {{ ticket.brand || 'Marque non définie' }} {{ ticket.model || '' }}
                  </p>
                  <p>IMEI: {{ ticket.imei || 'Aucun IMEI' }}</p>
                  <p>S/N: {{ ticket.serialNumber || 'Aucun numéro de série' }}</p>
                  <p>Accès: {{ ticket.accessCode || 'Aucun code d’accès' }}</p>
                  <p>SIM: {{ ticket.simCode || 'Aucun code SIM' }}</p>
                </div>

                <div class="rounded-2xl border border-default p-4">
                  <p class="text-xs uppercase tracking-[0.14em] text-toned">
                    Ouvert le
                  </p>
                  <p class="mt-1 font-medium text-highlighted">
                    {{ formatDateTime(ticket.openedAt) }}
                  </p>
                  <p class="mt-3 text-xs uppercase tracking-[0.14em] text-toned">
                    Dernière mise à jour
                  </p>
                  <p class="mt-1 font-medium text-highlighted">
                    {{ formatDateTime(ticket.updatedAt) }}
                  </p>
                </div>
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
</template>
