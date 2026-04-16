<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { CustomerRecord, DocumentListResponse, TicketListItem } from '~~/shared/types/pos'

const open = ref(false)

const links = [[{
  label: 'Vue d’ensemble',
  icon: 'i-lucide-house',
  to: '/',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Clients',
  icon: 'i-lucide-users',
  to: '/customers',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Catalogue',
  icon: 'i-lucide-package-search',
  to: '/catalog',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Tickets',
  icon: 'i-lucide-wrench',
  to: '/tickets',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Documents',
  icon: 'i-lucide-files',
  to: '/documents',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Paiements',
  icon: 'i-lucide-wallet',
  to: '/payments',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Reports',
  icon: 'i-lucide-chart-column',
  to: '/reports',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Assistant IA',
  icon: 'i-lucide-sparkles',
  to: '/assistant',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Stock téléphones',
  icon: 'i-lucide-smartphone',
  to: '/stocks-smartphone',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Réservations',
  icon: 'i-lucide-book-user',
  to: '/reservations-smartphone',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Vacances',
  icon: 'i-lucide-umbrella',
  to: '/vacances',
  onSelect: () => {
    open.value = false
  }
}], [{
  label: 'Paramètres',
  icon: 'i-lucide-settings',
  to: '/settings',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Boîte de réception',
  icon: 'i-lucide-inbox',
  to: '/inbox',
  onSelect: () => {
    open.value = false
  }
}]] satisfies NavigationMenuItem[][]

const [{ data: customers }, { data: tickets }, { data: documents }] = await Promise.all([
  useFetch<CustomerRecord[]>('/api/customers'),
  useFetch<TicketListItem[]>('/api/tickets'),
  useFetch<DocumentListResponse>('/api/documents', {
    query: {
      page: 1,
      pageSize: 5
    }
  })
])

const counterActions = [{
  id: 'new-sale',
  label: 'Vente rapide',
  icon: 'i-lucide-shopping-cart',
  to: '/sales/new'
}, {
  id: 'new-ticket',
  label: 'Nouveau ticket',
  icon: 'i-lucide-wrench',
  to: '/tickets/new'
}]

const quickActions = [...counterActions, {
  id: 'new-customer',
  label: 'Nouveau client',
  icon: 'i-lucide-user-plus',
  to: '/customers/new'
}, {
  id: 'new-document',
  label: 'Document avancé',
  icon: 'i-lucide-file-plus-2',
  to: '/documents/new'
}]

const groups = computed(() => {
  const customerItems = (customers.value || []).slice(0, 5).map(customer => ({
    id: `customer-${customer.id}`,
    label: customer.displayName,
    icon: 'i-lucide-users',
    to: `/customers/${customer.id}`,
    suffix: customer.phone
  }))

  const ticketItems = (tickets.value || []).slice(0, 5).map(ticket => ({
    id: `ticket-${ticket.id}`,
    label: ticket.ticketNumber,
    icon: 'i-lucide-wrench',
    to: `/tickets/${ticket.id}`,
    suffix: ticket.customerName
  }))

  const documentItems = (documents.value?.items || []).map(document => ({
    id: `document-${document.id}`,
    label: document.documentNumber,
    icon: 'i-lucide-files',
    to: `/documents/${document.id}`,
    suffix: document.customerName
  }))

  return [{
    id: 'navigate',
    label: 'Navigation',
    items: links.flat()
  }, {
    id: 'create',
    label: 'Actions rapides',
    items: quickActions
  }, {
    id: 'customers',
    label: 'Clients récents',
    items: customerItems
  }, {
    id: 'tickets',
    label: 'Tickets récents',
    items: ticketItems
  }, {
    id: 'documents',
    label: 'Documents récents',
    items: documentItems
  }].filter(group => group.items.length)
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <TeamsMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <div
          :class="collapsed
            ? 'mt-4 flex flex-col items-center gap-2'
            : 'mt-4 space-y-3 rounded-2xl border border-default bg-elevated/35 p-3'"
        >
          <div :class="collapsed ? 'flex flex-col gap-2' : 'space-y-2'">
            <UTooltip
              v-for="action in counterActions"
              :key="action.id"
              :text="action.label"
            >
              <UButton
                :to="action.to"
                :icon="action.icon"
                color="primary"
                :variant="collapsed ? 'soft' : 'solid'"
                :square="collapsed"
                :block="!collapsed"
                :label="collapsed ? undefined : action.label"
                :ui="collapsed ? undefined : { base: 'justify-start' }"
              />
            </UTooltip>
          </div>
        </div>

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          class="mt-4"
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />

    <NotificationsSlideover />
  </UDashboardGroup>
</template>
