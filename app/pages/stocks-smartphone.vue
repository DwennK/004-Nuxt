<script setup lang="ts">
import { foldSearchText } from '~~/shared/utils/search'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { Row } from '@tanstack/table-core'
import { format, isValid, parseISO } from 'date-fns'
import { upperFirst } from 'scule'
import { formatImei } from '~~/shared/utils/pos'
import type { SmartphoneStock } from '~/types'

type SmartphoneTableInstance = {
  tableApi?: {
    getColumn: (id: string) => {
      toggleVisibility: (value: boolean) => void
    } | undefined
    getAllColumns: () => Array<{
      id: string
      getCanHide: () => boolean
      getIsVisible: () => boolean
    }>
  }
}

const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const toast = useToast()
const { can } = useCapabilities()
const table = useTemplateRef<SmartphoneTableInstance>('table')
const editModalOpen = ref(false)
const editingItem = ref<SmartphoneStock | null>(null)

const columnVisibility = ref()
const model = ref('')
const search = refDebounced(model, 250)
const filters = computed(() => ({ search: search.value }))
const { data, status, pagination, sorting, rowSelection, selectedIds: selectedSmartphoneIds, total } = useSmartphoneList<SmartphoneStock>({
  key: 'smartphone-stocks',
  endpoint: '/api/smartphone-stocks/list',
  filters,
  matches: item => foldSearchText(item.model).includes(foldSearchText(search.value))
})

function formatSwissDate(value: string) {
  if (!value) {
    return ''
  }

  const date = parseISO(value)
  return isValid(date) ? format(date, 'dd/MM/yyyy') : value
}

function openStockEditor(item: SmartphoneStock) {
  editingItem.value = item
  editModalOpen.value = true
}

async function deleteSingleStock(id: number) {
  if (!can('records:delete')) {
    return
  }

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
  const items: DropdownMenuItem[] = [
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
        openStockEditor(row.original)
      }
    }
  ]

  if (can('records:delete')) {
    items.push({ type: 'separator' }, {
      label: 'Supprimer',
      icon: 'i-lucide-trash',
      color: 'error',
      onSelect() {
        deleteSingleStock(row.original.id)
      }
    })
  }

  return items
}

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
    accessorKey: 'capacity',
    header: 'Capacité'
  },
  {
    accessorKey: 'supplier',
    header: 'Fournisseur',
    cell: ({ row }) => row.original.supplier || '—'
  },
  {
    accessorKey: 'stockedAt',
    header: 'Entrée en stock',
    cell: ({ row }) => formatSwissDate(row.original.stockedAt)
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

function handleImeiScan(value: string) {
  model.value = value
}
</script>

<template>
  <UDashboardPanel id="smartphone-stocks">
    <template #header>
      <UDashboardNavbar title="Liste IMEI">
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
            v-bind="posInputAttrs"
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
            v-if="can('records:delete')"
            :count="selectedSmartphoneIds.length"
            :ids="selectedSmartphoneIds"
          >
            <UButton
              v-if="selectedSmartphoneIds.length"
              label="Supprimer"
              color="error"
              variant="subtle"
              icon="i-lucide-trash"
            >
              <template #trailing>
                <UKbd>
                  {{ selectedSmartphoneIds.length }}
                </UKbd>
              </template>
            </UButton>
          </SmartphonesDeleteModal>

          <UDropdownMenu
            :items="
              table?.tableApi
                ?.getAllColumns()
                .filter((column: any) => column.getCanHide())
                .map((column: any) => ({
                  label: ({
                    model: 'Modèle',
                    imei: 'IMEI',
                    capacity: 'Capacité',
                    supplier: 'Fournisseur',
                    stockedAt: 'Entrée en stock'
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
        v-model:column-visibility="columnVisibility"
        v-model:row-selection="rowSelection"
        v-model:pagination="pagination"
        v-model:sorting="sorting"
        :get-row-id="(row: SmartphoneStock) => String(row.id)"
        :sorting-options="{ manualSorting: true }"
        :column-filters-options="{ manualFiltering: true }"
        :pagination-options="{
          manualPagination: true,
          rowCount: total
        }"
        class="shrink-0"
        :data="data?.items"
        :columns="columns"
        :loading="status === 'pending'"
        :ui="{
          base: 'table-fixed border-separate border-spacing-0',
          th: 'py-2 text-xs',
          td: 'py-2 align-middle text-sm',
          separator: 'h-0'
        }"
        @select="(_, row) => openStockEditor(row.original)"
      >
        <template #empty>
          <div v-if="status === 'pending'" class="space-y-3 px-4 py-6">
            <USkeleton v-for="index in 5" :key="index" class="h-10 w-full" />
          </div>
          <UEmpty
            v-else
            icon="i-lucide-smartphone"
            title="Aucun téléphone en stock"
            description="Ajoutez un appareil ou ajustez les filtres."
          />
        </template>
      </UTable>

      <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto">
        <div class="text-sm text-muted">
          {{ selectedSmartphoneIds.length || 0 }} sur
          {{ total || 0 }} ligne(s) sélectionnée(s).
        </div>

        <div class="flex items-center gap-1.5">
          <UPagination
            :page="pagination.pageIndex + 1"
            :items-per-page="pagination.pageSize"
            :total="total"
            @update:page="(p: number) => pagination.pageIndex = p - 1"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
