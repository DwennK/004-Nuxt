<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import { upperFirst } from 'scule'
import type { DashboardTableColumn, DashboardTableInstance } from '~/types/table'
import type { CustomerRecord } from '~~/shared/types/pos'
import { formatDateTime } from '~~/shared/utils/pos'

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const toast = useToast()
const table = useTemplateRef<DashboardTableInstance>('table')

const search = ref('')
const createOpen = ref(false)
const editOpen = ref(false)
const editingCustomer = ref<CustomerRecord | null>(null)
const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})
const sorting = ref([{ id: 'displayName', desc: false }])
const columnVisibility = ref()

const { data: customers, status, refresh } = await useFetch<CustomerRecord[]>('/api/customers')

const filteredCustomers = computed(() => {
  const term = search.value.trim().toLowerCase()

  if (!term) {
    return customers.value || []
  }

  return (customers.value || []).filter((customer) => {
    return [
      customer.displayName,
      customer.companyName,
      customer.phone,
      customer.email,
      customer.city
    ].some(value => value?.toLowerCase().includes(term))
  })
})

const editingCustomerForm = computed(() => {
  if (!editingCustomer.value) {
    return undefined
  }

  return {
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

watch(search, () => {
  pagination.value.pageIndex = 0
})

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
  if (editingCustomer.value) {
    await $fetch(`/api/customers/${editingCustomer.value.id}`, {
      method: 'PATCH',
      body: payload
    })

    toast.add({ title: 'Customer updated', color: 'success' })
    editOpen.value = false
    editingCustomer.value = null
  } else {
    await $fetch('/api/customers', {
      method: 'POST',
      body: payload
    })

    toast.add({ title: 'Customer created', color: 'success' })
    createOpen.value = false
  }

  await refresh()
}

async function removeCustomer(id: number) {
  await $fetch(`/api/customers/${id}`, { method: 'DELETE' })
  toast.add({ title: 'Customer removed', color: 'success' })
  await refresh()
}

function openEditor(customer: CustomerRecord) {
  editingCustomer.value = customer
  editOpen.value = true
}

function getRowItems(customer: CustomerRecord) {
  return [[{
    label: 'Open customer',
    icon: 'i-lucide-arrow-up-right',
    onSelect() {
      navigateTo(`/customers/${customer.id}`)
    }
  }, {
    label: 'New ticket',
    icon: 'i-lucide-wrench',
    onSelect() {
      navigateTo(`/tickets/new?customerId=${customer.id}`)
    }
  }, {
    label: 'New document',
    icon: 'i-lucide-file-plus-2',
    onSelect() {
      navigateTo(`/documents/new?customerId=${customer.id}`)
    }
  }], [{
    label: 'Quick edit',
    icon: 'i-lucide-pencil',
    onSelect() {
      openEditor(customer)
    }
  }, {
    label: 'Delete',
    icon: 'i-lucide-trash',
    color: 'error',
    onSelect() {
      removeCustomer(customer.id)
    }
  }]]
}

const columns: TableColumn<CustomerRecord>[] = [
  {
    accessorKey: 'displayName',
    header: ({ column }) => h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label: 'Customer',
      icon: column.getIsSorted() === 'asc'
        ? 'i-lucide-arrow-up-az'
        : column.getIsSorted() === 'desc'
          ? 'i-lucide-arrow-down-az'
          : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
    }),
    cell: ({ row }) => h('div', { class: 'min-w-0' }, [
      h('p', { class: 'font-medium text-highlighted truncate' }, row.original.displayName),
      h('p', { class: 'text-sm text-toned truncate' }, row.original.companyName || row.original.email)
    ])
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ row }) => h('span', { class: 'font-medium' }, row.original.phone)
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => h('span', { class: 'text-toned' }, row.original.email)
  },
  {
    accessorKey: 'city',
    header: 'City',
    cell: ({ row }) => row.original.city || 'Not set'
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated',
    cell: ({ row }) => formatDateTime(row.original.updatedAt)
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
      <UDashboardNavbar title="Customers">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-user-plus"
            label="Quick customer"
            variant="subtle"
            @click="createOpen = true"
          />
          <UButton to="/customers/new" icon="i-lucide-arrow-up-right" label="Full form" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="flex flex-wrap items-center justify-between gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search by name, company, phone or email"
          class="max-w-md"
        />

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
            label="Columns"
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
          <PosSummaryCard title="Customers" :value="String(customers?.length || 0)" icon="i-lucide-users" />
          <PosSummaryCard title="Visible" :value="String(filteredCustomers.length)" icon="i-lucide-filter" />
          <PosSummaryCard title="Search mode" :value="search ? 'Filtered' : 'All'" icon="i-lucide-search" />
        </div>

        <UTable
          ref="table"
          v-model:pagination="pagination"
          v-model:sorting="sorting"
          v-model:column-visibility="columnVisibility"
          :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
          :data="filteredCustomers"
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
          @select="(_, row) => navigateTo(`/customers/${row.original.id}`)"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-users"
              title="No customers found"
              description="Create a customer or adjust the current search to see results."
            />
          </template>
        </UTable>

        <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
          <p class="text-sm text-toned">
            {{ table?.tableApi?.getFilteredRowModel().rows.length || filteredCustomers.length }} customer(s)
          </p>

          <UPagination
            :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
            :items-per-page="table?.tableApi?.getState().pagination.pageSize"
            :total="table?.tableApi?.getFilteredRowModel().rows.length || filteredCustomers.length"
            @update:page="(page: number) => table?.tableApi?.setPageIndex(page - 1)"
          />
        </div>
      </div>
    </template>

    <PosCustomerSlideover
      v-model:open="createOpen"
      title="Quick customer"
      description="Create a reusable customer file without leaving the list."
      submit-label="Create customer"
      @save="saveCustomer"
    />

    <PosCustomerSlideover
      v-model:open="editOpen"
      title="Edit customer"
      description="Update contact details while staying in the operator list."
      submit-label="Save changes"
      :initial-value="editingCustomerForm"
      @save="saveCustomer"
    />
  </UDashboardPanel>
</template>
