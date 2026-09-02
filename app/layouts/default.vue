<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const dashboardSearchOpen = ref(false)
const route = useRoute()
const { currentDashboardTheme } = useDashboardTheme()
const toolRoutes = ['/tools', '/vacances', '/inbox', '/assistant']

const primaryLinks = [{
  label: 'Comptoir',
  icon: 'i-lucide-scan-line',
  to: '/comptoir',
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
  label: 'Tickets',
  icon: 'i-lucide-wrench',
  to: '/tickets',
  onSelect: () => {
    open.value = false
  }
}] satisfies NavigationMenuItem[]

const secondaryLinks = [{
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
  label: 'Paiements',
  icon: 'i-lucide-wallet',
  to: '/payments',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Rapports',
  icon: 'i-lucide-chart-column',
  to: '/reports',
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
  label: 'Outils',
  icon: 'i-lucide-folder-cog',
  defaultOpen: toolRoutes.some(prefix => route.path.startsWith(prefix)),
  children: [{
    label: 'MobileSentrix',
    icon: 'i-lucide-plug',
    to: '/tools/mobilesentrix',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Import Woocommerce',
    icon: 'i-lucide-shopping-cart',
    to: '/tools/woocommerce-import',
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
  }, {
    label: 'Mails envoyés',
    icon: 'i-lucide-send',
    to: '/inbox',
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
  }]
}] satisfies NavigationMenuItem[]

const footerLinks = [{
  label: 'Paramètres',
  icon: 'i-lucide-settings',
  to: '/settings/users',
  onSelect: () => {
    open.value = false
  }
}] satisfies NavigationMenuItem[]

const dashboardSearchTerm = ref('')
const {
  canSearch: canRunDashboardSearch,
  results: dashboardSearchResults,
  loading: dashboardSearchLoading
} = useGlobalSearch(dashboardSearchTerm, 8)

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

type SearchNavigationItem = {
  id: string
  label: string
  icon?: string
  to: string
}

function flattenNavigationItems(items: NavigationMenuItem[]): SearchNavigationItem[] {
  return items.flatMap((item) => {
    if (item.children?.length) {
      return flattenNavigationItems(item.children)
    }

    if (typeof item.to !== 'string' || typeof item.label !== 'string') {
      return []
    }

    return [{
      id: `nav-${item.to}`,
      label: item.label,
      icon: item.icon,
      to: item.to
    }]
  })
}

const groups = computed(() => {
  if (!canRunDashboardSearch.value) {
    return [{
      id: 'navigate',
      label: 'Navigation',
      items: [
        ...flattenNavigationItems(primaryLinks),
        ...flattenNavigationItems(secondaryLinks),
        ...flattenNavigationItems(footerLinks)
      ]
    }, {
      id: 'create',
      label: 'Actions rapides',
      items: quickActions
    }]
  }

  const customerItems = (dashboardSearchResults.value?.customers.items || []).map(customer => ({
    id: `customer-${customer.id}`,
    label: customer.displayName,
    icon: 'i-lucide-users',
    to: `/customers/${customer.id}`,
    suffix: customer.phone,
    description: customer.email || 'Fiche client'
  }))

  const ticketItems = (dashboardSearchResults.value?.tickets.items || []).map(ticket => ({
    id: `ticket-${ticket.id}`,
    label: ticket.ticketNumber,
    icon: 'i-lucide-wrench',
    to: `/tickets/${ticket.id}`,
    suffix: ticket.customerName,
    description: [ticket.imei, ticket.serialNumber, ticket.brand, ticket.model].filter(Boolean).join(' · ')
  }))

  const documentItems = (dashboardSearchResults.value?.documents.items || []).map(document => ({
    id: `document-${document.id}`,
    label: document.documentNumber,
    icon: 'i-lucide-files',
    to: `/documents/${document.id}`,
    suffix: document.customerName,
    description: document.ticketNumber ? `Ticket ${document.ticketNumber}` : 'Document commercial'
  }))

  const catalogItems = (dashboardSearchResults.value?.catalogItems.items || []).map(item => ({
    id: `catalog-${item.id}`,
    label: item.name,
    icon: 'i-lucide-package-search',
    to: `/catalog/${item.id}`,
    suffix: item.sku || undefined,
    description: [item.brand, item.model, item.category].filter(Boolean).join(' · ')
  }))

  return [{
    id: 'customers',
    label: 'Clients',
    ignoreFilter: true,
    items: customerItems
  }, {
    id: 'tickets',
    label: 'Tickets',
    ignoreFilter: true,
    items: ticketItems
  }, {
    id: 'documents',
    label: 'Documents',
    ignoreFilter: true,
    items: documentItems
  }, {
    id: 'catalog',
    label: 'Catalogue',
    ignoreFilter: true,
    items: catalogItems
  }].filter(group => group.items.length)
})
</script>

<template>
  <UDashboardGroup unit="rem" :class="currentDashboardTheme.appClass">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      :default-size="15"
      :min-size="10"
      :max-size="20"
      class="outlook-sidebar"
      :ui="{
        root: 'ring-0',
        handle: 'w-px bg-[var(--mw-outlook-line)] hover:bg-[var(--mw-outlook-blue)] transition-colors',
        header: 'outlook-sidebar-header px-2 py-2',
        body: 'px-2 pb-2',
        footer: 'outlook-sidebar-footer px-2 py-2'
      }"
    >
      <template #header="{ collapsed }">
        <TeamsMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          :collapsed="collapsed"
          class="outlook-search-button"
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="primaryLinks"
          orientation="vertical"
          tooltip
          class="mt-3"
          popover
        />

        <USeparator class="my-3" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="secondaryLinks"
          orientation="vertical"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="footerLinks"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch
      v-model:open="dashboardSearchOpen"
      v-model:search-term="dashboardSearchTerm"
      :groups="groups"
      :loading="dashboardSearchLoading"
      title="Recherche globale"
      description="Rechercher un client, téléphone, ticket, IMEI, document, article ou code-barres."
      placeholder="Nom, téléphone, TIC-…, IMEI, facture, SKU…"
      :color-mode="false"
      preserve-group-order
    />

    <slot />
  </UDashboardGroup>
</template>
