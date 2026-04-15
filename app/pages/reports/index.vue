<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import ReportsOverviewCharts from '~/components/reports/ReportsOverviewCharts.client.vue'
import type { ReportsOverview } from '~~/shared/types/pos'
import { formatCurrency, toDateInputValue } from '~~/shared/utils/pos'

const date = ref(toDateInputValue())
const selectedTab = ref('revenue')

const tabs: TabsItem[] = [
  { label: 'Chiffre d’affaires', icon: 'i-lucide-chart-column', value: 'revenue', slot: 'revenue' },
  { label: 'Clients', icon: 'i-lucide-users', value: 'customers', slot: 'customers' },
  { label: 'Articles', icon: 'i-lucide-package', value: 'items', slot: 'items' }
]

const { data: overview, refresh, status } = await useFetch<ReportsOverview>('/api/reports/overview', {
  query: computed(() => ({
    date: date.value
  }))
})

watch(date, async () => {
  await refresh()
})

function formatRangeDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  return new Intl.DateTimeFormat('fr-CH', {
    day: 'numeric',
    month: 'long'
  }).format(new Date(Date.UTC(year!, month! - 1, day!, 12, 0, 0)))
}

const stats = computed(() => {
  if (!overview.value) {
    return []
  }

  return [{
    title: 'Encaissé sur 7 jours',
    value: formatCurrency(overview.value.kpis.totalPaid),
    description: `Période du ${formatRangeDate(overview.value.range.startDate)} au ${formatRangeDate(overview.value.range.endDate)}`,
    icon: 'i-lucide-wallet-cards'
  }, {
    title: 'Encaissé aujourd’hui',
    value: formatCurrency(overview.value.kpis.paidToday),
    description: `Ancré sur la date du ${formatRangeDate(date.value)}`,
    icon: 'i-lucide-badge-swiss-franc'
  }, {
    title: 'Moyenne par jour',
    value: formatCurrency(overview.value.kpis.averagePerDay),
    description: 'Base glissante sur 7 journées commerciales',
    icon: 'i-lucide-chart-column'
  }, {
    title: 'Tickets encore ouverts',
    value: String(overview.value.kpis.openTickets),
    description: 'Vue opérationnelle du backlog atelier',
    icon: 'i-lucide-wrench'
  }]
})
</script>

<template>
  <UDashboardPanel id="reports-overview">
    <template #header>
      <UDashboardNavbar title="Reports">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #trailing>
          <UBadge v-if="overview" color="neutral" variant="subtle">
            7 jours glissants
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTabs
        v-model="selectedTab"
        :items="tabs"
        class="w-full"
      >
        <template #revenue>
          <div class="space-y-4">
            <UDashboardToolbar>
              <div class="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="flex flex-wrap items-center gap-2">
                  <UInput v-model="date" type="date" class="w-52" />

                  <UBadge
                    v-if="overview"
                    color="primary"
                    variant="subtle"
                    size="sm"
                  >
                    {{ formatRangeDate(overview.range.startDate) }} → {{ formatRangeDate(overview.range.endDate) }}
                  </UBadge>
                </div>

                <UButton
                  to="/reports/daily"
                  label="Ouvrir la fin de journée"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-arrow-up-right"
                />
              </div>
            </UDashboardToolbar>

            <div v-if="status === 'pending' && !overview" class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-2xl" />
            </div>

            <div
              v-else-if="overview"
              class="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
            >
              <UCard
                v-for="stat in stats"
                :key="stat.title"
                :ui="{ body: 'p-4' }"
              >
                <div class="flex items-start gap-3">
                  <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring ring-primary/15">
                    <UIcon :name="stat.icon" class="size-4.5" />
                  </div>

                  <div class="min-w-0 space-y-1">
                    <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-toned">
                      {{ stat.title }}
                    </p>
                    <p class="text-2xl font-semibold leading-none text-highlighted">
                      {{ stat.value }}
                    </p>
                    <p class="text-sm text-toned">
                      {{ stat.description }}
                    </p>
                  </div>
                </div>
              </UCard>
            </div>

            <ReportsOverviewCharts
              v-if="overview"
              :overview="overview"
            />
          </div>
        </template>

        <template #customers />

        <template #items />
      </UTabs>
    </template>
  </UDashboardPanel>
</template>
