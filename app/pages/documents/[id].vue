<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import {
  documentStatusColors,
  documentStatusLabels,
  documentTypeColors,
  documentTypeLabels,
  lineCategoryColors,
  lineCategoryLabels,
  paymentMethodColors,
  paymentMethodLabels
} from '~~/shared/constants/pos'
import type { CatalogItemRecord, CustomerRecord, DocumentDetail } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const NuxtLink = resolveComponent('NuxtLink')

const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))
const activeTab = ref('overview')
const paymentOpen = ref(false)

const tabItems = [
  { label: 'Overview', value: 'overview', icon: 'i-lucide-file-text' },
  { label: 'Lines', value: 'lines', icon: 'i-lucide-list' },
  { label: 'Payments', value: 'payments', icon: 'i-lucide-wallet' },
  { label: 'Print', value: 'print', icon: 'i-lucide-printer' }
]

const [{ data: document, refresh }, { data: customers }, { data: catalogItems }] = await Promise.all([
  useFetch<DocumentDetail>(() => `/api/documents/${id.value}`),
  useFetch<CustomerRecord[]>('/api/customers'),
  useFetch<CatalogItemRecord[]>('/api/catalog-items', { query: { activeOnly: true } })
])

const paidAmount = computed(() => document.value?.payments
  .filter(payment => payment.status === 'paid')
  .reduce((total: number, payment) => total + payment.amount, 0) || 0)

const balanceDue = computed(() => Math.max((document.value?.total || 0) - paidAmount.value, 0))

async function saveDocument(payload: {
  type: 'quote' | 'invoice' | 'receipt' | 'credit_note'
  status: 'draft' | 'issued' | 'paid' | 'cancelled'
  customerId: number
  ticketId: number | null
  issuedAt: string
  notes: string
  lines: Array<{
    catalogItemId: number | null
    label: string
    quantity: number
    unitPrice: number
    vatRate: number
    categoryHint: 'accessory' | 'repair' | 'service' | null
  }>
}) {
  await $fetch(`/api/documents/${id.value}`, {
    method: 'PATCH',
    body: payload
  })

  toast.add({
    title: 'Document updated',
    color: 'success'
  })

  await refresh()
}

async function markPaid(payload: {
  method: 'cash' | 'card' | 'twint' | 'bank_transfer'
  amount: number
  reference: string
  notes: string
}) {
  await $fetch(`/api/documents/${id.value}/mark-paid`, {
    method: 'POST',
    body: payload
  })

  paymentOpen.value = false
  toast.add({
    title: 'Payment recorded',
    color: 'success'
  })
  await refresh()
}

const lineColumns: TableColumn<DocumentDetail['lines'][number]>[] = [
  {
    accessorKey: 'label',
    header: 'Line',
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h('p', { class: 'font-medium text-highlighted' }, row.original.label),
      row.original.categoryHint
        ? h(UBadge, {
            color: lineCategoryColors[row.original.categoryHint],
            variant: 'subtle'
          }, () => lineCategoryLabels[row.original.categoryHint!])
        : null
    ])
  },
  {
    accessorKey: 'quantity',
    header: 'Qty'
  },
  {
    accessorKey: 'unitPrice',
    header: 'Prix TTC',
    cell: ({ row }) => formatCurrency(row.original.unitPrice)
  },
  {
    accessorKey: 'vatRate',
    header: 'TVA incl.',
    cell: ({ row }) => `${row.original.vatRate}%`
  },
  {
    accessorKey: 'lineTotal',
    header: 'Total TTC',
    cell: ({ row }) => formatCurrency(row.original.lineTotal)
  }
]

const paymentColumns: TableColumn<DocumentDetail['payments'][number]>[] = [
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
  <UDashboardPanel id="document-detail">
    <template #header>
      <UDashboardNavbar :title="document?.documentNumber || 'Document detail'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            v-if="document?.status !== 'paid' && balanceDue > 0"
            icon="i-lucide-wallet"
            label="Record payment"
            variant="subtle"
            @click="paymentOpen = true"
          />
          <UButton :to="`/documents/${id}/print`" icon="i-lucide-printer" label="Printable view" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="document && customers && catalogItems" class="space-y-6">
        <div class="grid gap-4 md:grid-cols-4">
          <PosSummaryCard title="Total TTC" :value="formatCurrency(document.total)" icon="i-lucide-receipt" />
          <PosSummaryCard title="Encaisse" :value="formatCurrency(paidAmount)" icon="i-lucide-wallet" />
          <PosSummaryCard title="Reste a payer" :value="formatCurrency(balanceDue)" icon="i-lucide-badge-euro" />
          <PosSummaryCard title="Lignes" :value="String(document.lines.length)" icon="i-lucide-list" />
        </div>

        <UTabs
          v-model="activeTab"
          :items="tabItems"
          value-key="value"
          class="w-full"
        />

        <div v-if="activeTab === 'overview'" class="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div class="space-y-6">
            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Commercial state
                  </h2>
                </div>
              </template>

              <div class="space-y-3">
                <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                  <span class="text-sm text-toned">Type</span>
                  <UBadge :color="documentTypeColors[document.type]" variant="subtle">
                    {{ documentTypeLabels[document.type] }}
                  </UBadge>
                </div>
                <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                  <span class="text-sm text-toned">Status</span>
                  <UBadge :color="documentStatusColors[document.status]" variant="subtle">
                    {{ documentStatusLabels[document.status] }}
                  </UBadge>
                </div>
                <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                  <span class="text-sm text-toned">Issued at</span>
                  <span class="text-sm font-medium text-highlighted">{{ formatDateTime(document.issuedAt) }}</span>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Linked objects
                  </h2>
                </div>
              </template>

              <div class="space-y-3 text-sm text-toned">
                <div>
                  <p class="font-medium text-highlighted">
                    {{ document.customer.displayName }}
                  </p>
                  <p>{{ document.customer.phone }}</p>
                  <p>{{ document.customer.email }}</p>
                </div>
                <div class="rounded-2xl border border-default p-4">
                  <p v-if="document.ticket" class="font-medium text-highlighted">
                    Ticket
                  </p>
                  <p v-if="document.ticket">
                    <NuxtLink :to="`/tickets/${document.ticket.id}`" class="text-primary">
                      {{ document.ticket.ticketNumber }}
                    </NuxtLink>
                  </p>
                  <p v-else>
                    Direct sale / standalone document
                  </p>
                </div>
              </div>
            </UCard>
          </div>

          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Notes and totals
                </h2>
              </div>
            </template>

            <div class="space-y-4">
              <div class="rounded-2xl border border-default bg-muted/20 p-4">
                <p class="text-xs uppercase tracking-wide text-toned">
                  Notes
                </p>
                <p class="mt-2 text-sm text-highlighted">
                  {{ document.notes || 'No notes on this document.' }}
                </p>
              </div>
              <div class="grid gap-3 md:grid-cols-3">
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Total HT
                  </p>
                  <p class="mt-2 font-semibold text-highlighted">
                    {{ formatCurrency(document.subtotal) }}
                  </p>
                </div>
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    TVA incluse
                  </p>
                  <p class="mt-2 font-semibold text-highlighted">
                    {{ formatCurrency(document.taxAmount) }}
                  </p>
                </div>
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Balance
                  </p>
                  <p class="mt-2 font-semibold text-highlighted">
                    {{ formatCurrency(balanceDue) }}
                  </p>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <UCard v-else-if="activeTab === 'lines'">
          <template #header>
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                Document editor
              </h2>
              <p class="text-sm text-toned">
                Direct sales and ticket-linked billing share the same document editor.
              </p>
            </div>
          </template>

          <PosDocumentEditor
            :customers="customers"
            :catalog-items="catalogItems"
            :initial-value="document"
            :fixed-ticket-id="document.ticketId"
            submit-label="Save document"
            @save="saveDocument"
          />
        </UCard>

        <div v-else-if="activeTab === 'payments'" class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Payment history
                </h2>
              </div>
            </template>

            <UTable :data="document.payments" :columns="paymentColumns" sticky="header">
              <template #empty>
                <UEmpty
                  icon="i-lucide-wallet"
                  title="No payments recorded"
                  description="Record a payment from the header action."
                />
              </template>
            </UTable>
          </UCard>

          <div class="space-y-6">
            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Outstanding balance
                  </h2>
                </div>
              </template>

              <div class="space-y-4">
                <div class="rounded-2xl border border-default bg-muted/20 px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Remaining
                  </p>
                  <p class="mt-2 text-lg font-semibold text-highlighted">
                    {{ formatCurrency(balanceDue) }}
                  </p>
                </div>

                <UButton
                  v-if="document.status !== 'paid' && balanceDue > 0"
                  label="Record payment"
                  icon="i-lucide-wallet"
                  block
                  @click="paymentOpen = true"
                />
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Current lines
                  </h2>
                </div>
              </template>

              <UTable :data="document.lines" :columns="lineColumns">
                <template #empty>
                  <UEmpty
                    icon="i-lucide-list"
                    title="No lines"
                    description="Add lines in the document editor tab."
                    size="sm"
                    variant="naked"
                  />
                </template>
              </UTable>
            </UCard>
          </div>
        </div>

        <div v-else class="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Printable workflow
                </h2>
                <p class="text-sm text-toned">
                  Use the printable route for invoices, receipts, quotes, and credit notes.
                </p>
              </div>
            </template>

            <div class="space-y-4">
              <UButton :to="`/documents/${id}/print`" label="Open printable layout" icon="i-lucide-printer" />
              <div class="rounded-2xl border border-default p-4 text-sm text-toned">
                Print mode keeps the commercial layout separate from the operator editing surface.
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Current document lines
                </h2>
              </div>
            </template>

            <UTable :data="document.lines" :columns="lineColumns" sticky="header">
              <template #empty>
                <UEmpty
                  icon="i-lucide-list"
                  title="No lines"
                  description="Add lines in the editor tab."
                />
              </template>
            </UTable>
          </UCard>
        </div>
      </div>

      <PosDocumentPaymentSlideover
        v-if="document"
        v-model:open="paymentOpen"
        :balance-due="balanceDue"
        @save="markPaid"
      />
    </template>
  </UDashboardPanel>
</template>
