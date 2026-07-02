<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui'
import type { Row } from '@tanstack/table-core'
import { getPaginationRowModel } from '@tanstack/table-core'
import { format, isValid, parseISO } from 'date-fns'
import { upperFirst } from 'scule'
import type { SmartphoneReservationRequest, SmartphoneReservationStatus } from '~/types'

type ReservationTableInstance = {
  tableApi?: {
    getFilteredSelectedRowModel: () => { rows: Row<SmartphoneReservationRequest>[] }
    getColumn: (id: string) => {
      getFilterValue: () => unknown
      setFilterValue: (value: string | undefined) => void
      toggleVisibility: (value: boolean) => void
    } | undefined
    getAllColumns: () => Array<{
      id: string
      getCanHide: () => boolean
      getIsVisible: () => boolean
    }>
    getFilteredRowModel: () => { rows: Row<SmartphoneReservationRequest>[] }
    getState: () => {
      pagination: {
        pageIndex: number
        pageSize: number
      }
    }
    setPageIndex: (page: number) => void
  }
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const toast = useToast()
const table = useTemplateRef<ReservationTableInstance>('table')
const editModalOpen = ref(false)
const editingItem = ref<SmartphoneReservationRequest | null>(null)

const columnFilters = ref([{
  id: 'name',
  value: ''
}])
const columnVisibility = ref()
const rowSelection = ref({})

const { data, status } = await useFetch<SmartphoneReservationRequest[]>('/api/smartphone-reservations', {
  key: 'smartphone-reservation-requests',
  lazy: true
})

const statusLabels: Record<SmartphoneReservationStatus, string> = {
  pending: 'En attente',
  contacted: 'Contacté',
  sold: 'Vendu'
}

const statusColors: Record<SmartphoneReservationStatus, 'warning' | 'info' | 'success'> = {
  pending: 'warning',
  contacted: 'info',
  sold: 'success'
}

const statusTabItems: TabsItem[] = [
  {
    label: 'En attente',
    value: 'pending',
    icon: 'i-lucide-clock-3'
  },
  {
    label: 'Contacté',
    value: 'contacted',
    icon: 'i-lucide-phone-call'
  },
  {
    label: 'Vendu',
    value: 'sold',
    icon: 'i-lucide-badge-check'
  }
]

async function exportCsv() {
  try {
    const response = await fetch('/api/smartphone-reservations/export')

    if (!response.ok) {
      throw new Error('Export impossible')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const contentDisposition = response.headers.get('content-disposition') || ''
    const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/)

    anchor.href = url
    anchor.download = fileNameMatch?.[1] || 'demandes-reservation-smartphones.csv'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)

    toast.add({
      title: 'Export terminé',
      description: 'Le fichier CSV a été téléchargé.',
      color: 'success'
    })
  } catch (error) {
    toast.add({
      title: 'Erreur',
      description: error instanceof Error ? error.message : 'Export impossible',
      color: 'error'
    })
  }
}

function formatSwissDate(value: string) {
  if (!value) {
    return ''
  }

  const date = parseISO(value)
  return isValid(date) ? format(date, 'dd.MM.yyyy') : value
}

function formatPhoneDisplay(value: string) {
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D+/g, '')

  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`
  }

  if (digits.length === 11 && digits.startsWith('41')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`
  }

  return trimmed
}

function openReservationEditor(item: SmartphoneReservationRequest) {
  editingItem.value = item
  editModalOpen.value = true
}

async function deleteSingleReservation(id: number) {
  try {
    await $fetch('/api/smartphone-reservations/bulk-delete', {
      method: 'POST',
      body: {
        ids: [id]
      }
    })

    toast.add({
      title: 'Demande supprimée',
      description: 'La demande a été retirée de la liste.',
      color: 'success'
    })
    await refreshNuxtData('smartphone-reservation-requests')
  } catch (error) {
    toast.add({
      title: 'Erreur',
      description: error instanceof Error ? error.message : 'Suppression impossible',
      color: 'error'
    })
  }
}

function getRowItems(row: Row<SmartphoneReservationRequest>) {
  return [
    {
      type: 'label',
      label: 'Actions'
    },
    {
      label: 'Copier l’ID',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(row.original.id.toString())
        toast.add({
          title: 'Copié',
          description: 'ID de la demande copié dans le presse-papiers.'
        })
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Modifier',
      icon: 'i-lucide-pencil',
      onSelect() {
        openReservationEditor(row.original)
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Supprimer',
      icon: 'i-lucide-trash',
      color: 'error',
      onSelect() {
        deleteSingleReservation(row.original.id)
      }
    }
  ]
}

const selectedReservationIds = computed<number[]>(() => {
  return table.value?.tableApi?.getFilteredSelectedRowModel().rows.map(row => row.original.id) || []
})

const columns: TableColumn<SmartphoneReservationRequest>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        'modelValue': table.getIsSomePageRowsSelected()
          ? 'indeterminate'
          : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          table.toggleAllPageRowsSelected(!!value),
        'ariaLabel': 'Tout sélectionner'
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        'modelValue': row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
        'ariaLabel': 'Sélectionner la ligne'
      })
  },
  {
    accessorKey: 'name',
    header: ({ column }) => {
      const isSorted = column.getIsSorted()

      return h(UButton, {
        color: 'neutral',
        variant: 'ghost',
        label: 'Nom',
        icon: isSorted
          ? isSorted === 'asc'
            ? 'i-lucide-arrow-up-narrow-wide'
            : 'i-lucide-arrow-down-wide-narrow'
          : 'i-lucide-arrow-up-down',
        class: '-mx-2.5',
        onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
      })
    }
  },
  {
    accessorKey: 'phone',
    header: 'Téléphone',
    cell: ({ row }) => h('a', {
      href: `tel:${row.original.phone.replace(/\s+/g, '')}`,
      class: 'font-mono text-xs text-primary underline-offset-4 hover:underline sm:text-sm',
      onClick: (event: MouseEvent) => event.stopPropagation()
    }, formatPhoneDisplay(row.original.phone))
  },
  {
    accessorKey: 'model',
    header: 'Modèle'
  },
  {
    accessorKey: 'storage',
    header: 'Stockage',
    cell: ({ row }) => row.original.storage || '-'
  },
  {
    accessorKey: 'requestedAt',
    header: 'Date de demande',
    cell: ({ row }) => formatSwissDate(row.original.requestedAt)
  },
  {
    accessorKey: 'status',
    header: 'État',
    filterFn: 'equals',
    cell: ({ row }) => h(UBadge, {
      class: 'capitalize',
      variant: 'subtle',
      color: statusColors[row.original.status]
    }, () => statusLabels[row.original.status])
  },
  {
    accessorKey: 'notes',
    header: 'Remarques',
    cell: ({ row }) => h('p', {
      class: 'max-w-xs truncate text-muted'
    }, row.original.notes || '-')
  },
  {
    id: 'actions',
    cell: ({ row }) => h(
      'div',
      { class: 'text-right' },
      h(
        UDropdownMenu,
        {
          content: {
            align: 'end'
          },
          items: getRowItems(row)
        },
        () => h(UButton, {
          icon: 'i-lucide-ellipsis-vertical',
          color: 'neutral',
          variant: 'ghost',
          class: 'ml-auto'
        })
      )
    )
  }
]

const requestStatusFilter = ref<SmartphoneReservationStatus>('pending')

watch([() => requestStatusFilter.value, () => table.value?.tableApi], ([newVal, tableApi]) => {
  if (!tableApi) return

  const statusColumn = tableApi.getColumn('status')
  if (!statusColumn) return

  statusColumn.setFilterValue(newVal)
}, { immediate: true })

const name = computed({
  get: (): string => {
    return (table.value?.tableApi?.getColumn('name')?.getFilterValue() as string) || ''
  },
  set: (value: string) => {
    table.value?.tableApi?.getColumn('name')?.setFilterValue(value || undefined)
  }
})

const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})
</script>

<template>
  <UDashboardPanel id="smartphone-reservations">
    <template #header>
      <UDashboardNavbar title="Demandes de réservation">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <ReservationsFormModal />
          <ReservationsImportModal />
          <UButton
            label="Exporter CSV"
            icon="i-lucide-file-down"
            color="neutral"
            variant="outline"
            @click="exportCsv"
          />
          <ReservationsFormModal
            v-model:open="editModalOpen"
            mode="edit"
            :item="editingItem"
            :show-trigger="false"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UTabs
          v-model="requestStatusFilter"
          :items="statusTabItems"
          :content="false"
          class="w-full"
        />

        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <UInput
            v-model="name"
            class="max-w-sm"
            icon="i-lucide-search"
            placeholder="Filtrer par nom..."
          />

          <div class="flex flex-wrap items-center gap-1.5">
            <ReservationsDeleteModal
              :count="table?.tableApi?.getFilteredSelectedRowModel().rows.length"
              :ids="selectedReservationIds"
            >
              <UButton
                v-if="table?.tableApi?.getFilteredSelectedRowModel().rows.length"
                label="Supprimer"
                color="error"
                variant="subtle"
                icon="i-lucide-trash"
              >
                <template #trailing>
                  <UKbd>
                    {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length }}
                  </UKbd>
                </template>
              </UButton>
            </ReservationsDeleteModal>

            <UDropdownMenu
              :items="
                table?.tableApi
                  ?.getAllColumns()
                  .filter((column: any) => column.getCanHide())
                  .map((column: any) => ({
                    label: ({
                      name: 'Nom',
                      phone: 'Téléphone',
                      model: 'Modèle',
                      storage: 'Stockage',
                      requestedAt: 'Date de demande',
                      status: 'État',
                      notes: 'Remarques'
                    } as Record<string, string>)[column.id] || upperFirst(column.id),
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
          </div>
        </div>
      </div>

      <UTable
        ref="table"
        v-model:column-filters="columnFilters"
        v-model:column-visibility="columnVisibility"
        v-model:row-selection="rowSelection"
        v-model:pagination="pagination"
        :pagination-options="{
          getPaginationRowModel: getPaginationRowModel()
        }"
        class="shrink-0"
        :data="data"
        :columns="columns"
        :loading="status === 'pending'"
        :ui="{
          base: 'table-fixed border-separate border-spacing-0',
          thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
          tbody: '[&>tr]:last:[&>td]:border-b-0 [&>tr]:cursor-pointer [&>tr]:hover:bg-elevated/30',
          th: 'py-1.5 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r text-xs',
          td: 'border-b border-default py-2 align-middle text-sm',
          separator: 'h-0'
        }"
        @select="(_, row) => openReservationEditor(row.original)"
      >
        <template #empty>
          <div v-if="status === 'pending'" class="space-y-3 px-4 py-6">
            <USkeleton v-for="index in 5" :key="index" class="h-10 w-full" />
          </div>
          <UEmpty
            v-else
            icon="i-lucide-clipboard-list"
            title="Aucune réservation trouvée"
            description="Ajustez les filtres ou créez une nouvelle demande."
          />
        </template>
      </UTable>

      <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto">
        <div class="text-sm text-muted">
          {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length || 0 }} sur
          {{ table?.tableApi?.getFilteredRowModel().rows.length || 0 }} ligne(s) sélectionnée(s).
        </div>

        <div class="flex items-center gap-1.5">
          <UPagination
            :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
            :items-per-page="table?.tableApi?.getState().pagination.pageSize"
            :total="table?.tableApi?.getFilteredRowModel().rows.length"
            @update:page="(p: number) => table?.tableApi?.setPageIndex(p - 1)"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
