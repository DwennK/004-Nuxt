<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const settingsNavigation = useTemplateRef<HTMLDivElement>('settingsNavigation')
const { can } = useCapabilities()
const isInterfacePage = computed(() => route.path === '/settings/interface')
const isWidePage = computed(() => isInterfacePage.value || route.path === '/settings/backups')

function revealActiveTab() {
  settingsNavigation.value?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
onMounted(revealActiveTab)
watch(() => route.path, revealActiveTab, { flush: 'post' })

const links = computed(() => [[{
  label: 'Société',
  icon: 'i-lucide-building-2',
  to: '/settings/company'
}, {
  label: 'Messages client',
  icon: 'i-lucide-message-square-share',
  to: '/settings/customer-sms'
}, {
  label: 'Interface',
  icon: 'i-lucide-palette',
  to: '/settings/interface'
}, {
  label: 'Utilisateurs',
  icon: 'i-lucide-users',
  to: '/settings/users'
}, ...(can('administration:manage')
  ? [{
      label: 'Sauvegardes',
      icon: 'i-lucide-database-backup',
      to: '/settings/backups'
    }]
  : [])]] satisfies NavigationMenuItem[][])
</script>

<template>
  <UDashboardPanel id="settings" :ui="{ body: isWidePage ? 'lg:py-6' : 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar title="Paramètres">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <!-- NOTE: The `-mx-1` class is used to align with the `DashboardSidebarCollapse` button here. -->
        <div ref="settingsNavigation" class="-mx-1 min-w-0 flex-1 overflow-x-auto">
          <UNavigationMenu :items="links" highlight :ui="{ list: 'min-w-max', item: 'shrink-0' }" />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 sm:gap-6 lg:gap-12 w-full mx-auto" :class="isWidePage ? 'lg:max-w-5xl' : 'lg:max-w-2xl'">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
