<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const dashboardSearchOpen = ref(false)
const route = useRoute()
const { user } = useUserSession()
const { can } = useCapabilities()
const { refresh: refreshBackups, reset: resetBackups, hasAlert: backupAlert } = useBackupStatus()
const canCheckBackups = computed(() => can('administration:manage'))
const visibility = useDocumentVisibility()
onMounted(() => {
  void refreshBackups()
})
watch(() => user.value?.id, () => {
  resetBackups()
  void refreshBackups()
})
watch(visibility, (value) => {
  if (value === 'visible') void refreshBackups()
})
useEventListener('focus', () => {
  void refreshBackups()
})
useIntervalFn(() => {
  if (canCheckBackups.value && visibility.value === 'visible') void refreshBackups()
}, 60_000)
const { currentDashboardTheme } = useDashboardTheme()
const toolRoutes = ['/tools', '/stocks-smartphone', '/reservations-smartphone', '/vacances', '/inbox', '/assistant']

const primaryLinks = computed(() => [{
  label: 'Accueil',
  icon: 'i-lucide-house',
  to: '/',
  exact: true,
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Dossiers clients',
  icon: 'i-lucide-wrench',
  to: '/dossiers',
  onSelect: () => {
    open.value = false
  }
}] satisfies NavigationMenuItem[])

const documentLinks = computed(() => [{
  label: 'Documents',
  icon: 'i-lucide-files',
  to: '/documents',
  active: route.path.startsWith('/documents'),
  defaultOpen: true,
  children: [{
    label: 'Devis',
    icon: 'i-lucide-scroll-text',
    to: '/documents?type=quote',
    active: route.path === '/documents' && route.query.type === 'quote',
    onSelect: () => { open.value = false }
  }, {
    label: 'Commandes',
    icon: 'i-lucide-clipboard-list',
    to: '/documents?type=customer_order',
    active: route.path === '/documents' && route.query.type === 'customer_order',
    onSelect: () => { open.value = false }
  }, {
    label: 'Factures',
    icon: 'i-lucide-file-text',
    to: '/documents?type=invoice',
    active: route.path === '/documents' && route.query.type === 'invoice',
    onSelect: () => { open.value = false }
  }, {
    label: 'SAV',
    icon: 'i-lucide-wrench',
    to: '/documents?type=sav',
    active: route.path === '/documents' && route.query.type === 'sav',
    onSelect: () => { open.value = false }
  }],
  onSelect: () => {
    open.value = false
  }
}] satisfies NavigationMenuItem[])

const reportLinks = [{
  label: 'Total du jour',
  icon: 'i-lucide-calendar-check',
  to: '/reports/daily',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Rapports',
  icon: 'i-lucide-chart-column',
  to: '/reports',
  exact: true,
  onSelect: () => {
    open.value = false
  }
}] satisfies NavigationMenuItem[]

const secondaryLinks = [{
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
  label: 'Outils',
  icon: 'i-lucide-folder-cog',
  defaultOpen: toolRoutes.some(prefix => route.path.startsWith(prefix)),
  children: [{
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
    label: 'MobileSentrix',
    icon: 'i-lucide-plug',
    to: '/tools/mobilesentrix',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Import Shopify',
    icon: 'i-lucide-shopping-cart',
    to: '/tools/shopify-import',
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

const footerLinks = computed(() => [{
  'label': 'Paramètres',
  'icon': 'i-lucide-settings',
  'to': '/settings/users',
  'active': route.path.startsWith('/settings'),
  'chip': backupAlert.value ? { color: 'error', size: 'lg' } : false,
  'aria-label': backupAlert.value ? 'Paramètres — sauvegardes à vérifier' : 'Paramètres',
  'onSelect': () => {
    open.value = false
  }
}] satisfies NavigationMenuItem[])

const dashboardSearchTerm = ref('')
const handleRecordScan = useRecordScan(dashboardSearchTerm, () => {
  dashboardSearchOpen.value = false
})
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
  label: 'Nouveau dossier',
  icon: 'i-lucide-wrench',
  to: '/dossiers/new'
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
    const children = item.children?.length ? flattenNavigationItems(item.children) : []

    if (typeof item.to !== 'string' || typeof item.label !== 'string') {
      return children
    }

    return [{
      id: `nav-${item.to}`,
      label: item.label,
      icon: item.icon,
      to: item.to
    }, ...children]
  })
}

const groups = computed(() => {
  if (!canRunDashboardSearch.value) {
    return [{
      id: 'navigate',
      label: 'Navigation',
      items: [
        ...flattenNavigationItems(primaryLinks.value),
        ...flattenNavigationItems(documentLinks.value),
        ...flattenNavigationItems(reportLinks),
        ...flattenNavigationItems(secondaryLinks),
        ...flattenNavigationItems(footerLinks.value)
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
    to: `/dossiers/${ticket.id}`,
    suffix: ticket.customerName,
    description: [ticket.imei, ticket.serialNumber, ticket.brand, ticket.model].filter(Boolean).join(' · ')
  }))

  const documentItems = (dashboardSearchResults.value?.documents.items || []).map(document => ({
    id: `document-${document.id}`,
    label: document.documentNumber,
    icon: 'i-lucide-files',
    to: `/documents/${document.id}`,
    suffix: document.customerName,
    description: document.ticketNumber ? `Dossier ${document.ticketNumber}` : 'Document commercial'
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
    label: 'Dossiers clients',
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
          :items="documentLinks"
          orientation="vertical"
          tooltip
          popover
        />

        <USeparator class="my-3" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="reportLinks"
          orientation="vertical"
          tooltip
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
      :input="posInputAttrs"
      :groups="groups"
      :loading="dashboardSearchLoading"
      title="Recherche globale"
      description="Rechercher un client, téléphone, dossier, IMEI, document, article ou code-barres."
      placeholder="Nom, téléphone, TIC-…, IMEI, facture, SKU…"
      :color-mode="false"
      preserve-group-order
    >
      <template #footer>
        <div class="flex justify-end p-2">
          <PosBarcodeScanner
            title="Scanner un document"
            description="Placez le QR « Ouvrir le dossier » ou « Ouvrir le document » dans le cadre."
            trigger-label="Scanner un document"
            trigger-icon="i-lucide-qr-code"
            trigger-aria-label="Scanner un document avec la caméra"
            @scanned="handleRecordScan"
          />
        </div>
      </template>
    </UDashboardSearch>

    <slot />
  </UDashboardGroup>
</template>
