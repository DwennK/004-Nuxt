<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'
import type { CustomerListResponse, DocumentListResponse, TicketListResponse } from '~~/shared/types/pos'

const open = ref(false)
const route = useRoute()
const { dashboardTheme, dashboardThemes, dashboardThemeLabels, isPremiumDashboardTheme } = useDashboardTheme()
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
  label: 'Reports',
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

const [{ data: customers }, { data: tickets }, { data: documents }] = await Promise.all([
  useFetch<CustomerListResponse>('/api/customers', {
    query: {
      page: 1,
      pageSize: 5
    }
  }),
  useFetch<TicketListResponse>('/api/tickets', {
    query: {
      page: 1,
      pageSize: 5
    }
  }),
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

type PremiumNavigationItem = {
  label: string
  icon: string
  to: string
  activePrefixes?: string[]
}

const premiumNavigationSections: { label: string, items: PremiumNavigationItem[] }[] = [{
  label: 'Gestion',
  items: [{
    label: 'Documents',
    icon: 'i-lucide-files',
    to: '/documents'
  }, {
    label: 'Tickets',
    icon: 'i-lucide-wrench',
    to: '/tickets'
  }]
}, {
  label: 'Clients',
  items: [{
    label: 'Vue d’ensemble',
    icon: 'i-lucide-house',
    to: '/'
  }, {
    label: 'Clients',
    icon: 'i-lucide-users',
    to: '/customers'
  }, {
    label: 'Catalogue',
    icon: 'i-lucide-package-search',
    to: '/catalog'
  }]
}, {
  label: 'Ventes',
  items: [{
    label: 'Paiements',
    icon: 'i-lucide-wallet',
    to: '/payments'
  }, {
    label: 'Stock téléphones',
    icon: 'i-lucide-smartphone',
    to: '/stocks-smartphone'
  }, {
    label: 'Réservations',
    icon: 'i-lucide-book-user',
    to: '/reservations-smartphone'
  }]
}, {
  label: 'Analyse',
  items: [{
    label: 'Reports',
    icon: 'i-lucide-chart-column',
    to: '/reports'
  }]
}, {
  label: 'Outils',
  items: [{
    label: 'Outils',
    icon: 'i-lucide-folder-cog',
    to: '/tools/mobilesentrix',
    activePrefixes: toolRoutes
  }]
}]

const premiumUser = computed(() => ({
  name: 'DwennK',
  role: 'Administrateur'
}))

const premiumUserMenuItems = computed<DropdownMenuItem[][]>(() => [[{
  label: 'Interface comptoir',
  icon: 'i-lucide-panels-top-left',
  children: dashboardThemes.map(theme => ({
    label: dashboardThemeLabels[theme],
    icon: theme === 'premium' ? 'i-lucide-sparkles' : 'i-lucide-panel-left',
    type: 'checkbox' as const,
    checked: dashboardTheme.value === theme,
    onSelect(e: Event) {
      e.preventDefault()

      dashboardTheme.value = theme
    }
  }))
}]])

const sidebarClass = computed(() => isPremiumDashboardTheme.value
  ? 'counter-premium-sidebar border-r border-white/10 bg-[#061120] text-white shadow-[20px_0_70px_rgba(6,17,32,0.32)] lg:!w-[16.25rem] lg:!min-w-[16.25rem]'
  : 'bg-elevated/25')

const sidebarUi = computed(() => isPremiumDashboardTheme.value
  ? {
      root: 'ring-0',
      header: 'border-b-0 px-4 pb-2 pt-5',
      body: 'px-3 pb-4',
      footer: 'border-t-0 px-3 pb-4'
    }
  : { footer: 'lg:border-t lg:border-default' })

function isNavigationActive(item: PremiumNavigationItem) {
  const prefixes = item.activePrefixes || [item.to]

  return prefixes.some((prefix) => {
    if (prefix === '/') {
      return route.path === '/'
    }

    return route.path === prefix || route.path.startsWith(`${prefix}/`)
  })
}

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
  const customerItems = (customers.value?.items || []).slice(0, 5).map(customer => ({
    id: `customer-${customer.id}`,
    label: customer.displayName,
    icon: 'i-lucide-users',
    to: `/customers/${customer.id}`,
    suffix: customer.phone
  }))

  const ticketItems = (tickets.value?.items || []).slice(0, 5).map(ticket => ({
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
    items: [
      ...flattenNavigationItems(primaryLinks),
      ...flattenNavigationItems(secondaryLinks),
      ...flattenNavigationItems(footerLinks)
    ]
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
      :resizable="!isPremiumDashboardTheme"
      :default-size="isPremiumDashboardTheme ? 16.25 : 15"
      :min-size="isPremiumDashboardTheme ? 16.25 : 10"
      :max-size="isPremiumDashboardTheme ? 16.25 : 20"
      :class="sidebarClass"
      :ui="sidebarUi"
    >
      <template #header="{ collapsed }">
        <TeamsMenu v-if="!isPremiumDashboardTheme" :collapsed="collapsed" />

        <NuxtLink
          v-else
          to="/comptoir"
          class="flex items-center gap-3 rounded-2xl px-2 py-2 text-white transition hover:bg-white/5"
          :class="collapsed && 'justify-center'"
        >
          <UIcon name="i-simple-icons-nuxtdotjs" class="size-8 shrink-0 text-emerald-400" />
          <span v-if="!collapsed" class="text-2xl font-extrabold text-white">Nuxt</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <template v-if="!isPremiumDashboardTheme">
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
            :items="primaryLinks"
            orientation="vertical"
            tooltip
            class="mt-4"
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

        <template v-else>
          <NuxtLink
            to="/comptoir"
            class="mt-3 flex h-[3.2rem] items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-3 text-sm font-semibold leading-none text-white shadow-[0_18px_45px_rgba(0,220,130,0.16)] transition hover:bg-emerald-400/15"
            :class="collapsed && 'justify-center px-2'"
          >
            <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-slate-950 shadow-[0_0_28px_rgba(0,220,130,0.42)]">
              <UIcon name="i-lucide-store" class="size-5" />
            </span>
            <span v-if="!collapsed" class="min-w-0 flex-1">Comptoir</span>
            <UIcon v-if="!collapsed" name="i-lucide-chevron-right" class="size-4 text-emerald-300" />
          </NuxtLink>

          <div class="mt-2 space-y-5">
            <div
              v-for="section in premiumNavigationSections"
              :key="section.label"
              class="space-y-2"
            >
              <p
                v-if="!collapsed"
                class="px-3 text-[11px] font-semibold uppercase leading-none text-white/40"
              >
                {{ section.label }}
              </p>
              <div class="space-y-1">
                <UTooltip
                  v-for="item in section.items"
                  :key="item.to"
                  :text="item.label"
                >
                  <NuxtLink
                    :to="item.to"
                    class="group flex h-9 items-center gap-3 rounded-xl px-3 text-sm leading-none transition"
                    :class="[
                      collapsed && 'justify-center px-2',
                      isNavigationActive(item)
                        ? 'bg-white/10 text-white shadow-inner ring-1 ring-white/10'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    ]"
                  >
                    <UIcon
                      :name="item.icon"
                      class="size-5 shrink-0"
                      :class="isNavigationActive(item) ? 'text-emerald-300' : 'text-white/60 group-hover:text-white'"
                    />
                    <span v-if="!collapsed" class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                    <UIcon
                      v-if="!collapsed && section.label === 'Outils'"
                      name="i-lucide-chevron-right"
                      class="size-4 text-white/40"
                    />
                  </NuxtLink>
                </UTooltip>
              </div>
            </div>
          </div>
        </template>
      </template>

      <template #footer="{ collapsed }">
        <UserMenu v-if="!isPremiumDashboardTheme" :collapsed="collapsed" />

        <div v-else class="space-y-3">
          <UDropdownMenu
            :items="premiumUserMenuItems"
            :content="{ side: 'right', align: 'end' }"
          >
            <button
              type="button"
              class="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left shadow-[0_18px_50px_rgba(0,0,0,0.22)] transition hover:bg-white/10"
              :class="collapsed && 'flex justify-center p-2'"
            >
              <div class="flex items-center gap-3">
                <div class="relative">
                  <UAvatar
                    :alt="premiumUser.name"
                    size="md"
                    class="ring-2 ring-white/15"
                  />
                  <span class="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[#061120] bg-emerald-400" />
                </div>
                <div v-if="!collapsed" class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-white">
                    {{ premiumUser.name }}
                  </p>
                  <p class="truncate text-xs text-white/60">
                    {{ premiumUser.role }}
                  </p>
                </div>
                <UIcon
                  v-if="!collapsed"
                  name="i-lucide-chevron-down"
                  class="size-4 shrink-0 text-white/70"
                />
              </div>
            </button>
          </UDropdownMenu>

          <UTooltip text="Paramètres">
            <UButton
              to="/settings/users"
              icon="i-lucide-settings"
              color="neutral"
              variant="ghost"
              :label="collapsed ? undefined : 'Paramètres'"
              :square="collapsed"
              :block="!collapsed"
              class="justify-start border border-white/10 bg-white/5 text-white hover:bg-white/10"
              :ui="{ leadingIcon: 'text-white/70' }"
            />
          </UTooltip>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />

    <NotificationsSlideover />
  </UDashboardGroup>
</template>
