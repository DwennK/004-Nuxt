<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { documentStatusColors, documentStatusLabels, documentTypeColors, documentTypeLabels, paymentMethodColors, paymentMethodLabels, ticketStatusColors, ticketStatusLabels } from '~~/shared/constants/pos'
import type { CustomerFormValue, CustomerRecord, DocumentListItem, PaymentListItem, TicketListItem } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const NuxtLink = resolveComponent('NuxtLink')

const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))
const activeTab = ref('tickets')
const editOpen = ref(false)

const tabItems = [
  { label: 'Tickets', value: 'tickets', icon: 'i-lucide-wrench' },
  { label: 'Documents', value: 'documents', icon: 'i-lucide-files' },
  { label: 'Paiements', value: 'payments', icon: 'i-lucide-wallet' }
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

const customerAddressLine = computed(() => {
  if (!customer.value) {
    return 'Adresse non renseignée'
  }

  return [
    customer.value.addressLine1,
    customer.value.addressLine2,
    [customer.value.postalCode, customer.value.city].filter(Boolean).join(' ')
  ].filter(Boolean).join(', ') || 'Adresse non renseignée'
})

async function saveCustomer(payload: CustomerFormValue) {
  await $fetch(`/api/customers/${id.value}`, {
    method: 'PATCH',
    body: payload
  })

  toast.add({
    title: 'Client mis à jour',
    color: 'success'
  })

  editOpen.value = false
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
    header: 'Problème',
    cell: ({ row }) => h('p', { class: 'line-clamp-2 text-toned' }, row.original.issueDescription)
  },
  {
    accessorKey: 'openedAt',
    header: 'Ouvert le',
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
    header: 'Émis le',
    cell: ({ row }) => formatDateTime(row.original.issuedAt)
  }
]

const paymentColumns: TableColumn<PaymentListItem>[] = [
  {
    accessorKey: 'method',
    header: 'Mode de paiement',
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
    header: 'Encaissé à',
    cell: ({ row }) => formatDateTime(row.original.paidAt)
  }
]
</script>

<template>
  <UDashboardPanel id="customer-detail">
    <template #header>
      <UDashboardNavbar :title="customer?.displayName || 'Détail client'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            label="Modifier"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            @click="editOpen = true"
          />
          <UButton
            :to="`/tickets/new?customerId=${id}`"
            label="Nouveau ticket"
            icon="i-lucide-wrench"
            variant="subtle"
          />
          <UButton :to="`/documents/new?customerId=${id}`" label="Nouveau document" icon="i-lucide-file-plus-2" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="customer" class="space-y-4">
        <div class="rounded-2xl border border-default/80 bg-muted/20 px-4 py-3">
          <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-base font-semibold text-highlighted">
                  {{ customer.displayName }}
                </span>
                <span v-if="customer.companyName" class="text-sm text-toned">
                  · {{ customer.companyName }}
                </span>
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-toned">
                <span>{{ customer.phone || 'Pas de téléphone' }}</span>
                <span>{{ customer.email || 'Pas d’e-mail' }}</span>
                <span>{{ customerAddressLine }}</span>
              </div>
            </div>

            <div class="grid gap-2 sm:grid-cols-4">
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Tickets ouverts
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ (tickets || []).filter(ticket => ticket.status !== 'closed' && ticket.status !== 'cancelled').length }}
                </p>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Documents
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ documents?.length || 0 }}
                </p>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Paiements
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ payments?.length || 0 }}
                </p>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Chiffre d’affaires
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ formatCurrency((payments || []).reduce((sum, payment) => sum + payment.amount, 0)) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="grid gap-4 xl:h-[calc(100vh-18.5rem)] xl:grid-cols-[22rem_minmax(0,1fr)]">
          <div class="space-y-4 xl:min-h-0 xl:overflow-y-auto pr-1">
            <UCard :ui="{ body: 'space-y-3 p-4', header: 'p-4 pb-0' }">
              <template #header>
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-base font-semibold text-highlighted">
                    Fiche client
                  </h2>
                  <UButton
                    label="Modifier"
                    icon="i-lucide-pencil"
                    size="sm"
                    color="neutral"
                    variant="soft"
                    @click="editOpen = true"
                  />
                </div>
              </template>

              <div class="space-y-3 text-sm">
                <div>
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Contact
                  </p>
                  <p class="mt-1 font-medium text-highlighted">
                    {{ customer.displayName }}
                  </p>
                  <p class="mt-1 text-toned">
                    {{ customer.phone || 'Pas de téléphone' }}
                  </p>
                  <p class="text-toned">
                    {{ customer.email || 'Pas d’e-mail' }}
                  </p>
                </div>

                <div>
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Adresse
                  </p>
                  <p class="mt-1 text-highlighted">
                    {{ customerAddressLine }}
                  </p>
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="rounded-2xl border border-default px-4 py-3">
                    <p class="text-xs uppercase tracking-wide text-toned">
                      Créé le
                    </p>
                    <p class="mt-1 text-sm font-medium text-highlighted">
                      {{ formatDateTime(customer.createdAt) }}
                    </p>
                  </div>
                  <div class="rounded-2xl border border-default px-4 py-3">
                    <p class="text-xs uppercase tracking-wide text-toned">
                      Mis à jour
                    </p>
                    <p class="mt-1 text-sm font-medium text-highlighted">
                      {{ formatDateTime(customer.updatedAt) }}
                    </p>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard :ui="{ body: 'p-4', header: 'p-4 pb-0' }">
              <template #header>
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Notes
                  </h2>
                </div>
              </template>

              <div class="rounded-2xl border border-default bg-muted/20 px-4 py-3 text-sm text-highlighted">
                {{ customer.notes || 'Aucune note sur cette fiche client.' }}
              </div>
            </UCard>
          </div>

          <UCard :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }" class="xl:min-h-0">
            <template #header>
              <div>
                <h2 class="text-base font-semibold text-highlighted">
                  Activité liée
                </h2>
              </div>
            </template>

            <UTabs
              v-model="activeTab"
              :items="tabItems"
              value-key="value"
              variant="link"
              :content="false"
              class="w-full"
            />

            <div class="xl:max-h-[calc(100vh-24rem)] xl:overflow-auto pr-1">
              <UTable
                v-if="activeTab === 'tickets'"
                :data="tickets || []"
                :columns="ticketColumns"
                sticky="header"
              >
                <template #empty>
                  <UEmpty icon="i-lucide-wrench" title="Aucun ticket" description="Les tickets de travail suivis pour ce client apparaîtront ici." />
                </template>
              </UTable>

              <UTable
                v-else-if="activeTab === 'documents'"
                :data="documents || []"
                :columns="documentColumns"
                sticky="header"
              >
                <template #empty>
                  <UEmpty icon="i-lucide-files" title="Aucun document" description="Les devis, commandes, factures et reçus apparaîtront ici." />
                </template>
              </UTable>

              <UTable
                v-else
                :data="payments || []"
                :columns="paymentColumns"
                sticky="header"
              >
                <template #empty>
                  <UEmpty icon="i-lucide-wallet" title="Aucun paiement" description="Les paiements enregistrés pour ce client apparaîtront ici." />
                </template>
              </UTable>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <USlideover
    v-model:open="editOpen"
    title="Modifier le client"
    description="Mettre à jour les informations de la fiche client."
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <PosCustomerForm
        v-if="customer"
        :initial-value="customer"
        submit-label="Enregistrer les modifications"
        @save="saveCustomer"
      />
    </template>
  </USlideover>
</template>
