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
  ticketStatusLabels
} from '~~/shared/constants/pos'
import type { CustomerRecord, DocumentDetail, TicketDetail } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const NuxtLink = resolveComponent('NuxtLink')

const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))
const workflowOpen = ref(false)
const activeTab = ref('overview')

const tabItems = [
  { label: 'Overview', value: 'overview', icon: 'i-lucide-clipboard-list' },
  { label: 'Workflow', value: 'workflow', icon: 'i-lucide-workflow' },
  { label: 'Documents', value: 'documents', icon: 'i-lucide-files' },
  { label: 'Payments', value: 'payments', icon: 'i-lucide-wallet' }
]

const [{ data: ticket, refresh: refreshTicket }, { data: customers }] = await Promise.all([
  useFetch<TicketDetail>(() => `/api/tickets/${id.value}`),
  useFetch<CustomerRecord[]>('/api/customers')
])

async function saveTicket(payload: {
  customerId: number
  type: 'repair' | 'support'
  status: 'new' | 'diagnosis' | 'awaiting_customer_approval' | 'approved' | 'in_progress' | 'waiting_parts' | 'ready_for_pickup' | 'delivered' | 'closed' | 'cancelled'
  brand: string
  model: string
  serialNumber: string
  imei: string
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
    title: 'Ticket updated',
    color: 'success'
  })

  await refreshTicket()
}

async function createQuote() {
  const document = await $fetch<DocumentDetail>(`/api/tickets/${id.value}/quote`, { method: 'POST' })
  toast.add({ title: 'Quote created', color: 'success' })
  await refreshTicket()
  await navigateTo(`/documents/${document.id}`)
}

async function createInvoice() {
  const document = await $fetch<DocumentDetail>(`/api/tickets/${id.value}/invoice`, { method: 'POST' })
  toast.add({ title: 'Invoice created', color: 'success' })
  await refreshTicket()
  await navigateTo(`/documents/${document.id}`)
}

async function changeStatus(payload: {
  status: TicketDetail['status']
  internalNotes: string
}) {
  await $fetch(`/api/tickets/${id.value}/status`, {
    method: 'POST',
    body: payload
  })

  workflowOpen.value = false
  toast.add({ title: 'Ticket status updated', color: 'success' })
  await refreshTicket()
}

async function closeTicket(payload: { internalNotes: string }) {
  await $fetch(`/api/tickets/${id.value}/close`, {
    method: 'POST',
    body: payload
  })

  workflowOpen.value = false
  toast.add({ title: 'Ticket closed', color: 'success' })
  await refreshTicket()
}

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
    header: 'Issued',
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
    header: 'Method',
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
    header: 'Encaisse a',
    cell: ({ row }) => formatDateTime(row.original.paidAt)
  },
  {
    accessorKey: 'reference',
    header: 'Reference',
    cell: ({ row }) => row.original.reference || 'No reference'
  }
]
</script>

<template>
  <UDashboardPanel id="ticket-detail">
    <template #header>
      <UDashboardNavbar :title="ticket?.ticketNumber || 'Ticket detail'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-workflow"
            label="Workflow"
            variant="subtle"
            @click="workflowOpen = true"
          />
          <UButton
            icon="i-lucide-scroll-text"
            label="Create quote"
            variant="subtle"
            @click="createQuote"
          />
          <UButton icon="i-lucide-receipt" label="Create invoice" @click="createInvoice" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="ticket" class="space-y-6">
        <div class="grid gap-4 md:grid-cols-4">
          <PosSummaryCard title="Status" :value="ticketStatusLabels[ticket.status]" icon="i-lucide-badge-check" />
          <PosSummaryCard title="Linked documents" :value="String(ticket.documents.length)" icon="i-lucide-file-stack" />
          <PosSummaryCard title="Linked payments" :value="String(ticket.payments.length)" icon="i-lucide-wallet" />
          <PosSummaryCard title="Ticket total paid" :value="formatCurrency(ticket.payments.reduce((sum, payment) => sum + payment.amount, 0))" icon="i-lucide-wallet-cards" />
        </div>

        <UTabs
          v-model="activeTab"
          :items="tabItems"
          value-key="value"
          class="w-full"
        />

        <div v-if="activeTab === 'overview'" class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Ticket editor
                </h2>
                <p class="text-sm text-toned">
                  Workflow stays in the ticket. Commercial billing stays in the linked documents.
                </p>
              </div>
            </template>

            <PosTicketForm
              :customers="customers || []"
              :initial-value="ticket"
              submit-label="Save ticket"
              @save="saveTicket"
            />
          </UCard>

          <div class="space-y-6">
            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Customer and device
                  </h2>
                </div>
              </template>

              <div class="space-y-3 text-sm text-toned">
                <div>
                  <p class="font-medium text-highlighted">
                    {{ ticket.customer.displayName }}
                  </p>
                  <p>{{ ticket.customer.phone }}</p>
                  <p>{{ ticket.customer.email }}</p>
                </div>
                <div class="rounded-2xl border border-default bg-muted/20 p-4">
                  <p class="font-medium text-highlighted">
                    {{ ticket.brand || 'Brand not set' }} {{ ticket.model || '' }}
                  </p>
                  <p>{{ ticket.imei || 'No IMEI' }}</p>
                  <p>{{ ticket.serialNumber || 'No serial number' }}</p>
                </div>
                <div class="rounded-2xl border border-default p-4">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Issue description
                  </p>
                  <p class="mt-2 text-sm text-highlighted">
                    {{ ticket.issueDescription }}
                  </p>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Current workflow
                  </h2>
                </div>
              </template>

              <div class="space-y-3">
                <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                  <span class="text-sm text-toned">Current status</span>
                  <UBadge :color="ticketStatusColors[ticket.status]" variant="subtle">
                    {{ ticketStatusLabels[ticket.status] }}
                  </UBadge>
                </div>
                <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                  <span class="text-sm text-toned">Opened at</span>
                  <span class="text-sm font-medium text-highlighted">{{ formatDateTime(ticket.openedAt) }}</span>
                </div>
                <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                  <span class="text-sm text-toned">Closed at</span>
                  <span class="text-sm font-medium text-highlighted">{{ ticket.closedAt ? formatDateTime(ticket.closedAt) : 'Still open' }}</span>
                </div>
                <UButton
                  label="Open workflow actions"
                  icon="i-lucide-workflow"
                  variant="subtle"
                  block
                  @click="workflowOpen = true"
                />
              </div>
            </UCard>
          </div>
        </div>

        <div v-else-if="activeTab === 'workflow'" class="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Workflow snapshot
                </h2>
              </div>
            </template>

            <div class="space-y-3">
              <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                <span class="text-sm text-toned">Status</span>
                <UBadge :color="ticketStatusColors[ticket.status]" variant="subtle">
                  {{ ticketStatusLabels[ticket.status] }}
                </UBadge>
              </div>
              <div class="rounded-2xl border border-default px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-toned">
                  Internal notes
                </p>
                <p class="mt-2 text-sm text-highlighted">
                  {{ ticket.internalNotes || 'No internal notes yet.' }}
                </p>
              </div>
              <UButton
                label="Change status or close ticket"
                icon="i-lucide-workflow"
                block
                @click="workflowOpen = true"
              />
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Billing actions
                </h2>
                <p class="text-sm text-toned">
                  Quotes and invoices remain separate commercial objects.
                </p>
              </div>
            </template>

            <div class="grid gap-4 md:grid-cols-2">
              <UButton
                label="Create quote"
                icon="i-lucide-scroll-text"
                variant="subtle"
                class="justify-start"
                @click="createQuote"
              />
              <UButton
                label="Create invoice"
                icon="i-lucide-receipt"
                class="justify-start"
                @click="createInvoice"
              />
            </div>
          </UCard>
        </div>

        <UCard v-else-if="activeTab === 'documents'">
          <template #header>
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                Linked documents
              </h2>
              <p class="text-sm text-toned">
                Quotes, invoices, receipts, and credit notes linked to this tracked case.
              </p>
            </div>
          </template>

          <UTable :data="ticket.documents" :columns="documentColumns" sticky="header">
            <template #empty>
              <UEmpty
                icon="i-lucide-files"
                title="No linked documents"
                description="Create a quote or invoice from the ticket toolbar."
              />
            </template>
          </UTable>
        </UCard>

        <UCard v-else>
          <template #header>
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                Linked payments
              </h2>
              <p class="text-sm text-toned">
                Cashflow recorded against ticket-linked documents.
              </p>
            </div>
          </template>

          <UTable :data="ticket.payments" :columns="paymentColumns" sticky="header">
            <template #empty>
              <UEmpty
                icon="i-lucide-wallet"
                title="No linked payments"
                description="Payments recorded on linked documents will appear here."
              />
            </template>
          </UTable>
        </UCard>
      </div>

      <PosTicketWorkflowSlideover
        v-if="ticket"
        v-model:open="workflowOpen"
        :initial-status="ticket.status"
        :initial-notes="ticket.internalNotes"
        @update-status="changeStatus"
        @close-ticket="closeTicket"
      />
    </template>
  </UDashboardPanel>
</template>
