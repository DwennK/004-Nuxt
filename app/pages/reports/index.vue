<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { parseDate } from '@internationalized/date'
import ReportsLeaders from '~/components/reports/ReportsLeaders.vue'
import ReportsOverviewCharts from '~/components/reports/ReportsOverviewCharts.vue'
import ReportsCategories from '~/components/reports/ReportsCategories.vue'
import ReportsCommercial from '~/components/reports/ReportsCommercial.vue'
import type { CommercialReport, ReportsCategories as ReportsCategoriesData, ReportsLeaders as ReportsLeadersData, ReportsOverview } from '~~/shared/types/pos'
import { formatCurrency, formatDate, toDateInputValue } from '~~/shared/utils/pos'

const date = ref(toDateInputValue())
const last30Days = { startDate: parseDate(date.value).subtract({ days: 29 }).toString(), endDate: date.value }
const categoriesRange = ref({ ...last30Days })
const leadersRange = ref({ ...last30Days })
const commercialDate = ref(date.value)
const commercialPeriod = ref<CommercialReport['period']>('month')
const selectedTab = ref('revenue')
const showLeaders = computed(() => selectedTab.value === 'customers' || selectedTab.value === 'items')

const tabs: TabsItem[] = [
  { label: 'Encaissements', icon: 'i-lucide-chart-column', value: 'revenue', slot: 'revenue' },
  { label: 'Catégories et dossiers', icon: 'i-lucide-chart-pie', value: 'categories', slot: 'categories' },
  { label: 'Ventes facturées', icon: 'i-lucide-receipt-text', value: 'commercial', slot: 'commercial' },
  { label: 'Clients', icon: 'i-lucide-users', value: 'customers' },
  { label: 'Articles', icon: 'i-lucide-package', value: 'items' }
]

const { data: overviewData, refresh, status, error } = await useFetch<ReportsOverview>('/api/reports/overview', {
  key: 'reports-overview',
  lazy: true,
  query: computed(() => ({
    date: date.value,
    includeLeaders: false
  })),
  watch: false
})
const overview = computed(() => overviewData.value?.range.endDate === date.value ? overviewData.value : undefined)

watch(date, () => refresh(), { flush: 'post' })

const { data: categories, refresh: refreshCategories, status: categoriesStatus, error: categoriesError } = await useFetch<ReportsCategoriesData>('/api/reports/categories', {
  key: 'reports-categories',
  query: categoriesRange,
  immediate: false,
  watch: false
})
watch([() => selectedTab.value === 'categories', categoriesRange], ([visible]) => {
  if (visible) refreshCategories()
})

const { data: leaders, refresh: refreshLeaders, status: leadersStatus, error: leadersError } = await useFetch<ReportsLeadersData>('/api/reports/leaders', {
  key: 'reports-leaders',
  query: leadersRange,
  immediate: false,
  watch: false
})

watch([showLeaders, leadersRange], ([visible]) => {
  if (visible) refreshLeaders()
})

const stats = computed(() => {
  if (!overview.value) {
    return []
  }

  return [{
    title: 'Encaissé net sur 7 jours',
    value: formatCurrency(overview.value.kpis.totalPaid),
    icon: 'i-lucide-wallet-cards'
  }, {
    title: 'Encaissé net le jour sélectionné',
    value: formatCurrency(overview.value.kpis.paidToday),
    description: formatDate(overview.value.range.endDate),
    icon: 'i-lucide-badge-swiss-franc'
  }, {
    title: 'Moyenne par jour',
    value: formatCurrency(overview.value.kpis.averagePerDay),
    icon: 'i-lucide-chart-column'
  }, {
    title: 'Dossiers encore ouverts',
    value: String(overview.value.kpis.openTickets),
    description: 'Situation actuelle de l’atelier',
    icon: 'i-lucide-wrench'
  }]
})
</script>

<template>
  <UDashboardPanel id="reports-overview">
    <template #header>
      <UDashboardNavbar title="Rapports">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UTabs
          v-model="selectedTab"
          :items="tabs"
          class="w-full"
          :ui="{ list: 'max-w-full overflow-x-auto', trigger: 'shrink-0' }"
        >
          <template #commercial>
            <ReportsCommercial v-model:date="commercialDate" v-model:period="commercialPeriod" />
          </template>
          <template #revenue>
            <div class="space-y-4">
              <ReportsPeriodBar
                v-model:date="date"
                rolling-week
                :loading="status === 'pending'"
                @refresh="refresh()"
              />
              <PosAsyncState v-if="error" :error="error" @retry="refresh()" />
              <div
                v-if="(status === 'idle' || status === 'pending') && !overview"
                role="status"
                aria-label="Chargement des rapports"
                class="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
              >
                <USkeleton
                  v-for="index in 4"
                  :key="index"
                  aria-hidden="true"
                  class="h-28 rounded-2xl"
                />
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
                      <p v-if="stat.description" class="text-sm text-toned">
                        {{ stat.description }}
                      </p>
                    </div>
                  </div>
                </UCard>
              </div>

              <div
                v-if="(status === 'idle' || status === 'pending') && !overview"
                aria-hidden="true"
                class="space-y-4"
              >
                <USkeleton class="h-[28rem] rounded-2xl" />
              </div>

              <ReportsOverviewCharts
                v-if="overview"
                :overview="overview"
              />
            </div>
          </template>

          <template #categories>
            <div class="space-y-4">
              <ReportsPeriodBar v-model:range="categoriesRange" :loading="categoriesStatus === 'pending'" @refresh="refreshCategories()" />
              <PosAsyncState v-if="categoriesError" :error="categoriesError" @retry="refreshCategories()" />
              <div
                v-else-if="categoriesStatus === 'idle' || categoriesStatus === 'pending'"
                role="status"
                aria-label="Chargement des catégories et dossiers"
                class="grid gap-4 xl:grid-cols-2"
              >
                <USkeleton v-for="index in 2" :key="index" class="h-96 rounded-2xl" />
              </div>
              <ReportsCategories v-else-if="categories" :report="categories" />
            </div>
          </template>

          <template #content="{ item }">
            <div v-if="item.value === 'customers' || item.value === 'items'" class="space-y-4">
              <ReportsPeriodBar v-model:range="leadersRange" :loading="leadersStatus === 'pending'" @refresh="refreshLeaders()" />
              <PosAsyncState v-if="leadersError" :error="leadersError" @retry="refreshLeaders()" />
              <PosAsyncState v-else-if="leadersStatus === 'pending' || leadersStatus === 'idle'" loading loading-label="Chargement du classement" />
              <ReportsLeaders v-else-if="leaders" :kind="item.value" :leaders="leaders" />
            </div>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>
</template>
