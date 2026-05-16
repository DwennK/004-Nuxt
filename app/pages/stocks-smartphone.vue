<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Row } from '@tanstack/table-core'
import { getPaginationRowModel } from '@tanstack/table-core'
import { format, isValid, parseISO } from 'date-fns'
import { upperFirst } from 'scule'
import { formatImei } from '~~/shared/utils/pos'
import type { SmartphoneStock } from '~/types'

type SmartphoneTableInstance = {
  tableApi?: {
    getFilteredSelectedRowModel: () => { rows: Row<SmartphoneStock>[] }
    getColumn: (id: string) => {
      getFilterValue: () => unknown
      setFilterValue: (value: string | boolean | undefined) => void
      toggleVisibility: (value: boolean) => void
    } | undefined
    getAllColumns: () => Array<{
      id: string
      getCanHide: () => boolean
      getIsVisible: () => boolean
    }>
    getFilteredRowModel: () => { rows: Row<SmartphoneStock>[] }
    getState: () => {
      pagination: {
        pageIndex: number
        pageSize: number
      }
    }
    setPageIndex: (page: number) => void
  }
}

const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UCheckbox = resolveComponent('UCheckbox')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const toast = useToast()
const table = useTemplateRef<SmartphoneTableInstance>('table')
const editModalOpen = ref(false)
const editingItem = ref<SmartphoneStock | null>(null)

const columnFilters = ref([{
  id: 'model',
  value: ''
}])
const columnVisibility = ref()
const rowSelection = ref({})

const { data, status } = await useFetch<SmartphoneStock[]>('/api/smartphone-stocks', {
  key: 'smartphone-stocks',
  lazy: true
})

function formatSwissDate(value: string) {
  if (!value) {
    return ''
  }

  const date = parseISO(value)
  return isValid(date) ? format(date, 'dd.MM.yyyy') : value
}

async function updateSoldState(row: SmartphoneStock, sold: boolean) {
  try {
    await $fetch('/api/smartphone-stocks', {
      method: 'PATCH',
      body: {
        id: row.id,
        model: row.model,
        imei: row.imei,
        sku: row.sku,
        capacity: row.capacity,
        stockedAt: row.stockedAt,
        sold
      }
    })

    toast.add({
      title: 'Stock mis à jour',
      description: `${row.model} est maintenant ${sold ? 'vendu' : 'disponible'}.`,
      color: 'success'
    })
    await refreshNuxtData('smartphone-stocks')
  } catch (error) {
    toast.add({
      title: 'Erreur',
      description: error instanceof Error ? error.message : 'Mise à jour impossible',
      color: 'error'
    })
  }
}

async function deleteSingleStock(id: number) {
  try {
    await $fetch('/api/smartphone-stocks/bulk-delete', {
      method: 'POST',
      body: {
        ids: [id]
      }
    })

    toast.add({
      title: 'Smartphone supprimé',
      description: 'La ligne a été retirée du stock.',
      color: 'success'
    })
    await refreshNuxtData('smartphone-stocks')
  } catch (error) {
    toast.add({
      title: 'Erreur',
      description: error instanceof Error ? error.message : 'Suppression impossible',
      color: 'error'
    })
  }
}

function getRowItems(row: Row<SmartphoneStock>) {
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
          description: 'ID du smartphone copié dans le presse-papiers.'
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
        editingItem.value = row.original
        editModalOpen.value = true
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
        deleteSingleStock(row.original.id)
      }
    }
  ]
}

const selectedSmartphoneIds = computed<number[]>(() => {
  return table.value?.tableApi?.getFilteredSelectedRowModel().rows.map(row => row.original.id) || []
})

const columns: TableColumn<SmartphoneStock>[] = [
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
    accessorKey: 'model',
    header: ({ column }) => {
      const isSorted = column.getIsSorted()

      return h(UButton, {
        color: 'neutral',
        variant: 'ghost',
        label: 'Modèle',
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
    accessorKey: 'imei',
    header: 'IMEI',
    cell: ({ row }) => formatImei(row.original.imei) || '-'
  },
  {
    accessorKey: 'sku',
    header: 'SKU'
  },
  {
    accessorKey: 'capacity',
    header: 'Capacité'
  },
  {
    accessorKey: 'stockedAt',
    header: 'Entrée en stock',
    cell: ({ row }) => formatSwissDate(row.original.stockedAt)
  },
  {
    accessorKey: 'sold',
    header: 'Vendu',
    filterFn: 'equals',
    cell: ({ row }) => {
      return h('div', { class: 'flex items-center gap-3' }, [
        h(UCheckbox, {
          'modelValue': row.original.sold,
          'onUpdate:modelValue': (value: boolean | 'indeterminate') => updateSoldState(row.original, !!value),
          'ariaLabel': `Toggle sold for ${row.original.model}`
        }),
        h(UBadge, {
          color: row.original.sold ? 'success' : 'neutral',
          variant: 'subtle'
        }, () => row.original.sold ? 'Vendu' : 'Disponible')
      ])
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return h(
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
          () =>
            h(UButton, {
              icon: 'i-lucide-ellipsis-vertical',
              color: 'neutral',
              variant: 'ghost',
              class: 'ml-auto'
            })
        )
      )
    }
  }
]

const soldFilter = ref('all')

watch(() => soldFilter.value, (newVal) => {
  if (!table.value?.tableApi) return

  const soldColumn = table.value.tableApi.getColumn('sold')
  if (!soldColumn) return

  if (newVal === 'all') {
    soldColumn.setFilterValue(undefined)
  } else {
    soldColumn.setFilterValue(newVal === 'sold')
  }
})

const model = computed({
  get: (): string => {
    return (table.value?.tableApi?.getColumn('model')?.getFilterValue() as string) || ''
  },
  set: (value: string) => {
    table.value?.tableApi?.getColumn('model')?.setFilterValue(value || undefined)
  }
})

const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})

function handleImeiScan(value: string) {
  model.value = value
}
</script>

<template>
  <UDashboardPanel id="smartphone-stocks">
    <template #header>
      <UDashboardNavbar title="Stock téléphones">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <SmartphonesFormModal />
          <SmartphonesFormModal
            v-model:open="editModalOpen"
            mode="edit"
            :item="editingItem"
            :show-trigger="false"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-wrap items-center justify-between gap-1.5">
        <div class="flex gap-2">
          <UInput
            v-model="model"
            class="max-w-sm"
            icon="i-lucide-search"
            placeholder="Filtrer par modèle ou IMEI..."
          />
          <PosBarcodeScanner
            title="Scanner un IMEI"
            description="Scannez le code-barres IMEI pour rechercher dans le stock."
            trigger-aria-label="Scanner un IMEI"
            @scanned="handleImeiScan"
          />
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <SmartphonesDeleteModal
            :count="table?.tableApi?.getFilteredSelectedRowModel().rows.length"
            :ids="selectedSmartphoneIds"
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
          </SmartphonesDeleteModal>

          <USelect
            v-model="soldFilter"
            :items="[
              { label: 'Tous', value: 'all' },
              { label: 'Disponibles', value: 'available' },
              { label: 'Vendus', value: 'sold' }
            ]"
            :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
            placeholder="Filtrer le statut"
            class="min-w-32"
          />

          <UDropdownMenu
            :items="
              table?.tableApi
                ?.getAllColumns()
                .filter((column: any) => column.getCanHide())
                .map((column: any) => ({
                  label: ({
                    model: 'Modèle',
                    imei: 'IMEI',
                    sku: 'SKU',
                    capacity: 'Capacité',
                    stockedAt: 'Entrée en stock',
                    sold: 'Vendu'
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
          tbody: '[&>tr]:last:[&>td]:border-b-0',
          th: 'py-1.5 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r text-xs',
          td: 'border-b border-default py-2 align-middle text-sm',
          separator: 'h-0'
        }"
      />

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
