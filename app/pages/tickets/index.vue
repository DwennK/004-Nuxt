<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import { upperFirst } from 'scule'
import type { DashboardTableColumn, DashboardTableInstance } from '~/types/table'
import { ticketStatusColors, ticketStatusLabels, ticketTypeColors, ticketTypeLabels } from '~~/shared/constants/pos'
import type { DocumentDetail, TicketListItem } from '~~/shared/types/pos'
import { formatDateTime } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const toast = useToast()
const table = useTemplateRef<DashboardTableInstance>('table')

const search = ref('')
const statusFilter = ref<'all' | TicketListItem['status']>('all')
const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})
const sorting = ref([{ id: 'openedAt', desc: true }])
const columnVisibility = ref()

const statusItems = [
  { label: 'Tous les statuts', value: 'all' },
  ...Object.entries(ticketStatusLabels).map(([value, label]) => ({ label, value }))
]

const { data: tickets, status, refresh } = await useFetch<TicketListItem[]>('/api/tickets')

const filteredTickets = computed(() => {
  const term = search.value.trim().toLowerCase()

  return (tickets.value || []).filter((ticket) => {
    const matchesSearch = !term || [
      ticket.ticketNumber,
      ticket.customerName,
      ticket.brand,
      ticket.model,
      ticket.issueDescription
    ].some(value => value?.toLowerCase().includes(term))

    const matchesStatus = statusFilter.value === 'all' || ticket.status === statusFilter.value

    return matchesSearch && matchesStatus
  })
})

watch([search, statusFilter], () => {
  pagination.value.pageIndex = 0
})

async function createQuote(ticketId: number) {
  const document = await $fetch<DocumentDetail>(`/api/tickets/${ticketId}/quote`, { method: 'POST' })
  toast.add({ title: 'Devis créé', color: 'success' })
  await refresh()
  await navigateTo(`/documents/${document.id}`)
}

async function createOrder(ticketId: number) {
  const document = await $fetch<DocumentDetail>(`/api/tickets/${ticketId}/order`, { method: 'POST' })
  toast.add({ title: 'Commande créée', color: 'success' })
  await refresh()
  await navigateTo(`/documents/${document.id}`)
}

async function createInvoice(ticketId: number) {
  const document = await $fetch<DocumentDetail>(`/api/tickets/${ticketId}/invoice`, { method: 'POST' })
  toast.add({ title: 'Facture créée', color: 'success' })
  await refresh()
  await navigateTo(`/documents/${document.id}`)
}

async function removeTicket(id: number) {
  await $fetch(`/api/tickets/${id}`, { method: 'DELETE' })
  toast.add({ title: 'Ticket supprimé', color: 'success' })
  await refresh()
}

function getRowItems(ticket: TicketListItem) {
  return [[{
    label: 'Ouvrir le ticket',
    icon: 'i-lucide-arrow-up-right',
    onSelect() {
      navigateTo(`/tickets/${ticket.id}`)
    }
  }, {
    label: 'Créer un devis',
    icon: 'i-lucide-scroll-text',
    onSelect() {
      createQuote(ticket.id)
    }
  }, {
    label: 'Créer une commande',
    icon: 'i-lucide-clipboard-plus',
    onSelect() {
      createOrder(ticket.id)
    }
  }, {
    label: 'Créer une facture',
    icon: 'i-lucide-file-text',
    onSelect() {
      createInvoice(ticket.id)
    }
  }], [{
    label: 'Supprimer',
    icon: 'i-lucide-trash',
    color: 'error',
    onSelect() {
      removeTicket(ticket.id)
    }
  }]]
}

const columns: TableColumn<TicketListItem>[] = [
  {
    accessorKey: 'ticketNumber',
    header: ({ column }) => h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label: 'Ticket',
      icon: column.getIsSorted() === 'asc'
        ? 'i-lucide-arrow-up-az'
        : column.getIsSorted() === 'desc'
          ? 'i-lucide-arrow-down-az'
          : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
    }),
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h('p', { class: 'font-medium text-highlighted' }, row.original.ticketNumber),
      h('div', { class: 'flex flex-wrap gap-2' }, [
        h(UBadge, { color: ticketTypeColors[row.original.type], variant: 'subtle' }, () => ticketTypeLabels[row.original.type]),
        h(UBadge, { color: ticketStatusColors[row.original.status], variant: 'subtle' }, () => ticketStatusLabels[row.original.status])
      ])
    ])
  },
  {
    accessorKey: 'customerName',
    header: 'Client',
    cell: ({ row }) => h('div', { class: 'min-w-0' }, [
      h('p', { class: 'font-medium truncate' }, row.original.customerName),
      h('p', { class: 'text-sm text-toned truncate' }, [row.original.brand, row.original.model].filter(Boolean).join(' ') || 'Appareil non défini')
    ])
  },
  {
    accessorKey: 'issueDescription',
    header: 'Problème',
    cell: ({ row }) => h('p', { class: 'line-clamp-2 max-w-md text-toned' }, row.original.issueDescription)
  },
  {
    accessorKey: 'documentCount',
    header: 'Documents',
    cell: ({ row }) => `${row.original.documentCount}`
  },
  {
    accessorKey: 'openedAt',
    header: ({ column }) => h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label: 'Ouvert le',
      icon: column.getIsSorted() === 'asc'
        ? 'i-lucide-arrow-up'
        : column.getIsSorted() === 'desc'
          ? 'i-lucide-arrow-down'
          : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
    }),
    cell: ({ row }) => formatDateTime(row.original.openedAt)
  },
  {
    id: 'actions',
    cell: ({ row }) => h('div', { class: 'text-right' }, h(
      UDropdownMenu,
      {
        content: { align: 'end' },
        items: getRowItems(row.original)
      },
      () => h(UButton, {
        icon: 'i-lucide-ellipsis-vertical',
        color: 'neutral',
        variant: 'ghost'
      })
    ))
  }
]
</script>

<template>
  <UDashboardPanel id="tickets-list">
    <template #header>
      <UDashboardNavbar title="Tickets">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton to="/tickets/new" icon="i-lucide-plus" label="Nouveau ticket" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Rechercher par ticket, client, appareil ou problème"
            class="max-w-md"
          />

          <USelectMenu
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            class="w-64"
          />
        </div>

        <UDropdownMenu
          :items="
            table?.tableApi
              ?.getAllColumns()
              .filter((column: DashboardTableColumn) => column.getCanHide())
              .map((column: DashboardTableColumn) => ({
                label: upperFirst(column.id),
                type: 'checkbox' as const,
                checked: column.getIsVisible(),
                onUpdateChecked(checked: boolean) {
                  table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
                },
                onSelect(e?: Event) {
                  e?.preventDefault()
                }
              }))
          "
          :content="{ align: 'end' }"
        >
          <UButton
            label="Colonnes"
            color="neutral"
            variant="outline"
            trailing-icon="i-lucide-settings-2"
          />
        </UDropdownMenu>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="grid gap-4 md:grid-cols-4">
          <PosSummaryCard title="Tickets" :value="String(tickets?.length || 0)" icon="i-lucide-wrench" />
          <PosSummaryCard title="Ouverts" :value="String((tickets || []).filter(ticket => !['closed', 'cancelled'].includes(ticket.status)).length)" icon="i-lucide-folder-open" />
          <PosSummaryCard title="Prêts" :value="String((tickets || []).filter(ticket => ticket.status === 'ready_for_pickup').length)" icon="i-lucide-package-check" />
          <PosSummaryCard title="Visibles" :value="String(filteredTickets.length)" icon="i-lucide-filter" />
        </div>

        <UTable
          ref="table"
          v-model:pagination="pagination"
          v-model:sorting="sorting"
          v-model:column-visibility="columnVisibility"
          :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
          :data="filteredTickets"
          :columns="columns"
          sticky="header"
          :loading="status === 'pending'"
          class="shrink-0"
          :ui="{
            base: 'table-fixed border-separate border-spacing-0',
            thead: '[&>tr]:bg-elevated/60 [&>tr]:after:content-none',
            tbody: '[&>tr]:last:[&>td]:border-b-0',
            th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
            td: 'border-b border-default align-top',
            separator: 'h-0'
          }"
          @select="(_, row) => navigateTo(`/tickets/${row.original.id}`)"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-wrench"
              title="Aucun ticket trouvé"
              description="Essayez un autre filtre ou créez un nouveau ticket."
            />
          </template>
        </UTable>

        <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
          <p class="text-sm text-toned">
            {{ table?.tableApi?.getFilteredRowModel().rows.length || filteredTickets.length }} ticket(s)
          </p>

          <UPagination
            :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
            :items-per-page="table?.tableApi?.getState().pagination.pageSize"
            :total="table?.tableApi?.getFilteredRowModel().rows.length || filteredTickets.length"
            @update:page="(page: number) => table?.tableApi?.setPageIndex(page - 1)"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
