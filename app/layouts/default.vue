<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { CustomerRecord, DocumentListItem, TicketListItem } from '~~/shared/types/pos'

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
  label: 'Fin de journée',
  icon: 'i-lucide-chart-column',
  to: '/reports/daily',
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
  useFetch<DocumentListItem[]>('/api/documents')
])

const quickActions = [{
  id: 'new-customer',
  label: 'Nouveau client',
  icon: 'i-lucide-user-plus',
  to: '/customers/new'
}, {
  id: 'new-ticket',
  label: 'Nouveau ticket',
  icon: 'i-lucide-wrench',
  to: '/tickets/new'
}, {
  id: 'new-document',
  label: 'Nouveau document',
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

  const documentItems = (documents.value || []).slice(0, 5).map(document => ({
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

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
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
