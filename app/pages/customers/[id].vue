<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { documentStatusColors, documentStatusLabels, documentTypeColors, documentTypeLabels, paymentMethodColors, paymentMethodLabels, ticketStatusColors, ticketStatusLabels } from '~~/shared/constants/pos'
import type { CustomerRecord, DocumentListItem, PaymentListItem, TicketListItem } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const NuxtLink = resolveComponent('NuxtLink')

const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))
const activeTab = ref('tickets')

const tabItems = [
  { label: 'Tickets', value: 'tickets', icon: 'i-lucide-wrench' },
  { label: 'Documents', value: 'documents', icon: 'i-lucide-files' },
  { label: 'Payments', value: 'payments', icon: 'i-lucide-wallet' }
]

const [{ data: customer, refresh: refreshCustomer }, { data: tickets, refresh: refreshTickets }, { data: documents, refresh: refreshDocuments }, { data: payments, refresh: refreshPayments }] = await Promise.all([
  useFetch<CustomerRecord>(() => `/api/customers/${id.value}`),
  useFetch<TicketListItem[]>('/api/tickets', {
    query: computed(() => ({ customerId: id.value }))
  }),
  useFetch<DocumentListItem[]>('/api/documents', {
    query: computed(() => ({ customerId: id.value }))
  }),
  useFetch<PaymentListItem[]>('/api/payments', {
    query: computed(() => ({ customerId: id.value }))
  })
])

async function saveCustomer(payload: {
  firstName: string
  lastName: string
  companyName: string
  phone: string
  email: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  city: string
  notes: string
}) {
  await $fetch(`/api/customers/${id.value}`, {
    method: 'PATCH',
    body: payload
  })

  toast.add({
    title: 'Customer updated',
    color: 'success'
  })

  await Promise.all([refreshCustomer(), refreshTickets(), refreshDocuments(), refreshPayments()])
}

const ticketColumns: TableColumn<TicketListItem>[] = [
  {
    accessorKey: 'ticketNumber',
    header: 'Ticket',
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h(NuxtLink, { to: `/tickets/${row.original.id}`, class: 'font-medium text-highlighted' }, () => row.original.ticketNumber),
      h(UBadge, { color: ticketStatusColors[row.original.status], variant: 'subtle' }, () => ticketStatusLabels[row.original.status])
    ])
  },
  {
    accessorKey: 'issueDescription',
    header: 'Issue',
    cell: ({ row }) => h('p', { class: 'line-clamp-2 text-toned' }, row.original.issueDescription)
  },
  {
    accessorKey: 'openedAt',
    header: 'Opened',
    cell: ({ row }) => formatDateTime(row.original.openedAt)
  }
]

const documentColumns: TableColumn<DocumentListItem>[] = [
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
    accessorKey: 'total',
    header: 'Total TTC',
    cell: ({ row }) => formatCurrency(row.original.total)
  },
  {
    accessorKey: 'issuedAt',
    header: 'Issued',
    cell: ({ row }) => formatDateTime(row.original.issuedAt)
  }
]

const paymentColumns: TableColumn<PaymentListItem>[] = [
  {
    accessorKey: 'method',
    header: 'Method',
    cell: ({ row }) => h(UBadge, {
      color: paymentMethodColors[row.original.method],
      variant: 'subtle'
    }, () => paymentMethodLabels[row.original.method])
  },
  {
    accessorKey: 'documentNumber',
    header: 'Document'
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
  }
]
</script>

<template>
  <UDashboardPanel id="customer-detail">
    <template #header>
      <UDashboardNavbar :title="customer?.displayName || 'Customer detail'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            :to="`/tickets/new?customerId=${id}`"
            label="New ticket"
            icon="i-lucide-wrench"
            variant="subtle"
          />
          <UButton :to="`/documents/new?customerId=${id}`" label="New document" icon="i-lucide-file-plus-2" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <div class="grid gap-4 lg:grid-cols-4">
          <PosSummaryCard title="Open tickets" :value="String((tickets || []).filter(ticket => ticket.status !== 'closed' && ticket.status !== 'cancelled').length)" icon="i-lucide-wrench" />
          <PosSummaryCard title="Documents" :value="String(documents?.length || 0)" icon="i-lucide-file-text" />
          <PosSummaryCard title="Payments" :value="String(payments?.length || 0)" icon="i-lucide-wallet" />
          <PosSummaryCard title="Turnover" :value="formatCurrency((payments || []).reduce((sum, payment) => sum + payment.amount, 0))" icon="i-lucide-wallet-cards" />
        </div>

        <div class="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Edit customer
                </h2>
                <p class="text-sm text-toned">
                  One customer file can be reused across tickets, documents, and payments.
                </p>
              </div>
            </template>

            <PosCustomerForm
              v-if="customer"
              :initial-value="customer"
              submit-label="Save changes"
              @save="saveCustomer"
            />
          </UCard>

          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Related activity
                </h2>
              </div>
            </template>

            <UTabs
              v-model="activeTab"
              :items="tabItems"
              value-key="value"
              class="w-full"
            />

            <div class="mt-4">
              <UTable v-if="activeTab === 'tickets'" :data="tickets || []" :columns="ticketColumns">
                <template #empty>
                  <UEmpty icon="i-lucide-wrench" title="No tickets" description="Tracked work tickets for this customer will appear here." />
                </template>
              </UTable>

              <UTable v-else-if="activeTab === 'documents'" :data="documents || []" :columns="documentColumns">
                <template #empty>
                  <UEmpty icon="i-lucide-files" title="No documents" description="Quotes, invoices, and receipts will appear here." />
                </template>
              </UTable>

              <UTable v-else :data="payments || []" :columns="paymentColumns">
                <template #empty>
                  <UEmpty icon="i-lucide-wallet" title="No payments" description="Recorded payments for this customer will appear here." />
                </template>
              </UTable>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
