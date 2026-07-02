<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { upperFirst } from 'scule'
import type { DashboardTableColumn, DashboardTableInstance } from '~/types/table'
import type { CustomerFormValue, CustomerListResponse, CustomerRecord } from '~~/shared/types/pos'

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const confirmDelete = useConfirmDelete()
const runApiAction = useApiAction()
const table = useTemplateRef<DashboardTableInstance>('table')

const search = ref('')
const debouncedSearch = refDebounced(search, 250)
const createOpen = ref(false)
const editOpen = ref(false)
const editingCustomer = ref<CustomerRecord | null>(null)
const pagination = ref({
  pageIndex: 0,
  pageSize: 50
})
const columnVisibility = ref()

const query = computed(() => ({
  search: debouncedSearch.value.trim() || undefined,
  page: pagination.value.pageIndex + 1,
  pageSize: pagination.value.pageSize
}))

const { data: customersResponse, status, refresh } = await useFetch<CustomerListResponse>('/api/customers', {
  query,
  lazy: true
})

const customers = computed(() => customersResponse.value?.items || [])
const totalResults = computed(() => customersResponse.value?.total || 0)
const totalPages = computed(() => Math.max(Math.ceil(totalResults.value / pagination.value.pageSize), 1))

watch(debouncedSearch, () => {
  pagination.value.pageIndex = 0
})

watch(totalResults, (total) => {
  const lastPageIndex = Math.max(Math.ceil(total / pagination.value.pageSize) - 1, 0)

  if (pagination.value.pageIndex > lastPageIndex) {
    pagination.value.pageIndex = lastPageIndex
  }
})

const editingCustomerForm = computed(() => {
  if (!editingCustomer.value) {
    return undefined
  }

  return {
    displayName: editingCustomer.value.displayName,
    firstName: editingCustomer.value.firstName,
    lastName: editingCustomer.value.lastName,
    companyName: editingCustomer.value.companyName || '',
    phone: editingCustomer.value.phone,
    email: editingCustomer.value.email,
    addressLine1: editingCustomer.value.addressLine1 || '',
    addressLine2: editingCustomer.value.addressLine2 || '',
    postalCode: editingCustomer.value.postalCode || '',
    city: editingCustomer.value.city || '',
    notes: editingCustomer.value.notes || ''
  }
})

async function saveCustomer(payload: CustomerFormValue) {
  if (editingCustomer.value) {
    const result = await runApiAction(
      () => $fetch(`/api/customers/${editingCustomer.value!.id}`, {
        method: 'PATCH',
        body: payload
      }),
      { success: 'Client mis à jour', errorTitle: 'Mise à jour impossible' }
    )

    if (!result.ok) {
      return
    }

    editOpen.value = false
    editingCustomer.value = null
  } else {
    const result = await runApiAction(
      () => $fetch('/api/customers', {
        method: 'POST',
        body: payload
      }),
      { success: 'Client créé', errorTitle: 'Création impossible' }
    )

    if (!result.ok) {
      return
    }

    createOpen.value = false
  }

  await refresh()
}

async function removeCustomer(customer: CustomerRecord) {
  const confirmed = await confirmDelete({
    title: `Supprimer ${customer.displayName} ?`,
    description: 'La fiche client sera définitivement supprimée.'
  })

  if (!confirmed) {
    return
  }

  const result = await runApiAction(
    () => $fetch(`/api/customers/${customer.id}`, { method: 'DELETE' }),
    { success: 'Client supprimé', errorTitle: 'Suppression impossible' }
  )

  if (result.ok) {
    await refresh()
  }
}

function openEditor(customer: CustomerRecord) {
  editingCustomer.value = customer
  editOpen.value = true
}

function getRowItems(customer: CustomerRecord) {
  return [[{
    label: 'Ouvrir le client',
    icon: 'i-lucide-arrow-up-right',
    onSelect() {
      navigateTo(`/customers/${customer.id}`)
    }
  }, {
    label: 'Nouveau ticket',
    icon: 'i-lucide-wrench',
    onSelect() {
      navigateTo(`/tickets/new?customerId=${customer.id}`)
    }
  }, {
    label: 'Nouveau devis / facture',
    icon: 'i-lucide-file-plus-2',
    onSelect() {
      navigateTo(`/documents/new?customerId=${customer.id}`)
    }
  }], [{
    label: 'Modification rapide',
    icon: 'i-lucide-pencil',
    onSelect() {
      openEditor(customer)
    }
  }, {
    label: 'Supprimer',
    icon: 'i-lucide-trash',
    color: 'error',
    onSelect() {
      removeCustomer(customer)
    }
  }]]
}

const columns: TableColumn<CustomerRecord>[] = [
  {
    accessorKey: 'displayName',
    header: 'Client',
    cell: ({ row }) => h('div', { class: 'min-w-0 leading-tight' }, [
      h('p', { class: 'truncate font-medium text-highlighted' }, row.original.displayName),
      row.original.companyName
        ? h('p', { class: 'truncate text-xs text-toned' }, row.original.companyName)
        : null
    ])
  },
  {
    accessorKey: 'phone',
    header: 'Téléphone',
    cell: ({ row }) => h('span', { class: 'font-medium' }, row.original.phone)
  },
  {
    accessorKey: 'email',
    header: 'E-mail',
    cell: ({ row }) => h('span', { class: 'text-toned' }, row.original.email)
  },
  {
    accessorKey: 'city',
    header: 'Ville',
    cell: ({ row }) => row.original.city || 'Non renseignée'
  },
  {
    accessorKey: 'updatedAt',
    header: 'Mis à jour',
    cell: ({ row }) => new Intl.DateTimeFormat('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(row.original.updatedAt))
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
  <UDashboardPanel id="customers-list">
    <template #header>
      <UDashboardNavbar title="Clients">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-user-plus"
            label="Client rapide"
            variant="subtle"
            @click="createOpen = true"
          />
          <UButton to="/customers/new" icon="i-lucide-arrow-up-right" label="Fiche complète" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="flex flex-wrap items-center justify-between gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Rechercher par nom, société, téléphone ou e-mail"
          class="max-w-md"
        />

        <UDropdownMenu
          :items="
            table?.tableApi
              ?.getAllColumns()
              .filter((column: DashboardTableColumn) => column.getCanHide())
              .map((column: DashboardTableColumn) => ({
                label: ({
                  displayName: 'Client',
                  phone: 'Téléphone',
                  email: 'E-mail',
                  city: 'Ville',
                  updatedAt: 'Mis à jour',
                  actions: 'Actions'
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
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="grid gap-4 md:grid-cols-3">
          <PosSummaryCard title="Clients" :value="String(totalResults)" icon="i-lucide-users" />
          <PosSummaryCard title="Sur la page" :value="String(customers.length)" icon="i-lucide-filter" />
          <PosSummaryCard title="Mode de recherche" :value="search ? 'Filtré' : 'Tous'" icon="i-lucide-search" />
        </div>

        <UTable
          ref="table"
          v-model:column-visibility="columnVisibility"
          :data="customers"
          :columns="columns"
          sticky="header"
          :loading="status === 'pending'"
          class="shrink-0"
          :ui="{
            base: 'table-fixed border-separate border-spacing-0',
            thead: '[&>tr]:bg-elevated/60 [&>tr]:after:content-none',
            tbody: '[&>tr]:last:[&>td]:border-b-0',
            th: 'py-1.5 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r text-xs',
            td: 'border-b border-default py-2 align-middle text-sm',
            separator: 'h-0'
          }"
          @select="(_, row) => navigateTo(`/customers/${row.original.id}`)"
        >
          <template #empty>
            <div v-if="status === 'pending'" class="space-y-3 px-4 py-6">
              <USkeleton v-for="index in 5" :key="index" class="h-10 w-full" />
            </div>
            <UEmpty
              v-else
              icon="i-lucide-users"
              title="Aucun client trouvé"
              description="Créez un client ou ajustez la recherche pour voir des résultats."
            />
          </template>
        </UTable>

        <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
          <p class="text-sm text-toned">
            {{ totalResults }} client(s) · page {{ pagination.pageIndex + 1 }} / {{ totalPages }}
          </p>

          <UPagination
            :page="pagination.pageIndex + 1"
            :items-per-page="pagination.pageSize"
            :total="totalResults"
            @update:page="(page: number) => { pagination.pageIndex = page - 1 }"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <PosCustomerSlideover
    v-model:open="createOpen"
    title="Client rapide"
    description="Créez une fiche client réutilisable sans quitter la liste."
    submit-label="Créer le client"
    @save="saveCustomer"
  />

  <PosCustomerSlideover
    v-model:open="editOpen"
    title="Modifier le client"
    description="Mettez à jour les coordonnées sans quitter la liste opérateur."
    submit-label="Enregistrer les modifications"
    :initial-value="editingCustomerForm"
    @save="saveCustomer"
  />
</template>
