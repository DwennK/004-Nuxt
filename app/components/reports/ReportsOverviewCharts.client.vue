<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { BarChart, DonutChart } from 'vue-chrts'
import { lineCategoryColors, paymentMethodColors, paymentMethodLabels } from '~~/shared/constants/pos'
import type { PaymentMethod, ReportsOverview } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

type UiColorToken = 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

const props = defineProps<{
  overview: ReportsOverview
}>()

const selectedPaymentPeriod = ref<'week' | 'month' | 'years'>('week')

const paymentPeriodTabs: TabsItem[] = [
  { label: '7 jours', value: 'week' },
  { label: 'Mois', value: 'month' },
  { label: 'Années', value: 'years' }
]

function toChartColor(color: UiColorToken) {
  return `var(--ui-color-${color}-500)`
}

const activePaymentPeriod = computed(() => {
  return props.overview.paymentPeriods.find(period => period.key === selectedPaymentPeriod.value) || props.overview.paymentPeriods[0]
})

const paymentsChartData = computed(() => activePaymentPeriod.value?.buckets || [])

const paymentSeries: Array<{
  method: PaymentMethod
  key: keyof ReportsOverview['paymentPeriods'][number]['buckets'][number]
}> = [
  { method: 'cash', key: 'cash' },
  { method: 'card_twint', key: 'cardTwint' },
  { method: 'bank_transfer', key: 'bankTransfer' },
  { method: 'stripe', key: 'stripe' }
]

const paymentsCategories = Object.fromEntries(
  paymentSeries.map(({ method, key }) => [
    key,
    {
      name: paymentMethodLabels[method],
      color: toChartColor(paymentMethodColors[method])
    }
  ])
)

const paymentAxisKeys = paymentSeries.map(({ key }) => key)

const paymentTicks = computed(() => {
  const count = paymentsChartData.value.length

  if (count <= 12) {
    return paymentsChartData.value.map((_, index) => index)
  }

  const targetTickCount = 6
  const step = Math.max(1, Math.ceil((count - 1) / (targetTickCount - 1)))
  const ticks = Array.from({ length: count }, (_, index) => index).filter(index => index % step === 0)

  if (ticks[ticks.length - 1] !== count - 1) {
    ticks.push(count - 1)
  }

  return ticks
})

const hasPaymentActivity = computed(() => paymentsChartData.value.some(day => day.total > 0))

const dayLabel = (tick: number | Date) => {
  const index = Math.round(Number(tick))
  return paymentsChartData.value[index]?.label || ''
}

const currencyLabel = (tick: number | Date) => formatCurrency(Number(tick))

function formatTooltipDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)

  return new Intl.DateTimeFormat('fr-CH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date(Date.UTC(year!, month! - 1, day!, 12, 0, 0)))
}

const turnoverChartData = computed(() => props.overview.turnoverByCategory)

const turnoverCategories = computed(() => {
  return Object.fromEntries(
    turnoverChartData.value.map(item => [
      item.category,
      {
        name: item.label,
        color: toChartColor(lineCategoryColors[item.category])
      }
    ])
  )
})

const turnoverTotal = computed(() => {
  return turnoverChartData.value.reduce((sum, item) => sum + item.total, 0)
})

const hasTurnoverActivity = computed(() => turnoverTotal.value > 0)

const turnoverTooltipTitle = (item: { label?: string }) => item.label || ''

const ticketChartData = computed(() => props.overview.ticketFlowByDay)

const ticketCategories = {
  opened: {
    name: 'Ouverts',
    color: toChartColor('primary')
  },
  closed: {
    name: 'Clôturés',
    color: toChartColor('success')
  }
}

const ticketTicks = computed(() => ticketChartData.value.map((_, index) => index))

const hasTicketActivity = computed(() => ticketChartData.value.some(day => day.opened > 0 || day.closed > 0))

const integerLabel = (tick: number | Date) => String(Math.round(Number(tick)))
</script>

<template>
  <div class="space-y-4 reports-overview-chart">
    <UCard :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }">
      <template #header>
        <div class="space-y-4">
          <div class="flex flex-col gap-1">
            <h2 class="text-base font-semibold text-highlighted">
              Chiffre d’affaires encaissé
            </h2>
            <p class="text-sm text-toned">
              {{ activePaymentPeriod?.description || 'Ventilation par mode de paiement sur la période sélectionnée.' }}
            </p>
          </div>

          <UTabs
            v-model="selectedPaymentPeriod"
            :items="paymentPeriodTabs"
            variant="link"
            color="neutral"
            :content="false"
            size="sm"
            :ui="{
              list: 'w-full border-b border-default',
              trigger: 'grow justify-center sm:grow-0'
            }"
          />
        </div>
      </template>

      <div
        v-if="hasPaymentActivity"
        class="overflow-hidden rounded-2xl border border-default/80 bg-muted/20 px-3 py-3"
      >
        <BarChart
          :data="paymentsChartData"
          :categories="paymentsCategories"
          :height="320"
          :stacked="true"
          :y-axis="paymentAxisKeys"
          :padding="{ top: 12, right: 12, bottom: 0, left: 0 }"
          :radius="10"
          :group-padding="18"
          :bar-padding="0.12"
          :x-explicit-ticks="paymentTicks"
          :x-grid-line="false"
          :x-tick-line="false"
          :y-grid-line="true"
          :y-tick-line="false"
          :x-formatter="dayLabel"
          :y-formatter="currencyLabel"
          :tooltip-title-formatter="(item) => item.tooltipLabel"
        />
      </div>

      <UEmpty
        v-else
        icon="i-lucide-chart-column-stacked"
        title="Aucun encaissement sur la période"
        description="La période sélectionnée ne contient encore aucun paiement encaissé."
      />
    </UCard>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <UCard :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }">
        <template #header>
          <div class="flex flex-col gap-1">
            <h2 class="text-base font-semibold text-highlighted">
              Répartition du chiffre d’affaires
            </h2>
            <p class="text-sm text-toned">
              Part du CA encaissé par catégorie sur la même fenêtre.
            </p>
          </div>
        </template>

        <div
          v-if="hasTurnoverActivity"
          class="overflow-hidden rounded-2xl border border-default/80 bg-muted/20 px-3 py-4"
        >
          <DonutChart
            :data="turnoverChartData.map(item => item.total)"
            :categories="turnoverCategories"
            :height="248"
            :radius="78"
            :arc-width="20"
            :pad-angle="0.018"
            :tooltip-title-formatter="turnoverTooltipTitle"
          >
            <div class="space-y-1 text-center">
              <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                Total encaissé
              </p>
              <p class="text-sm font-semibold text-highlighted">
                {{ formatCurrency(turnoverTotal) }}
              </p>
            </div>
          </DonutChart>
        </div>

        <UEmpty
          v-else
          icon="i-lucide-chart-pie"
          title="Aucune catégorie à afficher"
          description="Les lignes encaissées de la période apparaîtront ici."
        />
      </UCard>

      <UCard :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }">
        <template #header>
          <div class="flex flex-col gap-1">
            <h2 class="text-base font-semibold text-highlighted">
              Flux tickets
            </h2>
            <p class="text-sm text-toned">
              Ouvertures et clôtures par jour sur 7 jours glissants.
            </p>
          </div>
        </template>

        <div
          v-if="hasTicketActivity"
          class="overflow-hidden rounded-2xl border border-default/80 bg-muted/20 px-3 py-3"
        >
          <BarChart
            :data="ticketChartData"
            :categories="ticketCategories"
            :height="248"
            :y-axis="['opened', 'closed']"
            :padding="{ top: 12, right: 12, bottom: 0, left: 0 }"
            :radius="10"
            :group-padding="18"
            :bar-padding="0.2"
            :x-explicit-ticks="ticketTicks"
            :x-grid-line="false"
            :x-tick-line="false"
            :y-grid-line="true"
            :y-tick-line="false"
            :x-formatter="dayLabel"
            :y-formatter="integerLabel"
            :tooltip-title-formatter="(item) => formatTooltipDate(item.date)"
          />
        </div>

        <UEmpty
          v-else
          icon="i-lucide-wrench"
          title="Aucune variation de tickets"
          description="Les ouvertures et clôtures apparaîtront ici dès qu’il y aura de l’activité."
        />
      </UCard>
    </div>
  </div>
</template>

<style scoped>
.reports-overview-chart {
  --vis-axis-grid-color: color-mix(in srgb, var(--ui-border) 86%, transparent);
  --vis-axis-tick-color: var(--ui-border);
  --vis-axis-tick-label-color: var(--ui-text-dimmed);
  --vis-tooltip-background-color: light-dark(#ffffff, #18181b);
  --vis-tooltip-border-color: light-dark(rgba(24, 24, 27, 0.12), rgba(255, 255, 255, 0.12));
  --vis-tooltip-text-color: light-dark(#18181b, #fafafa);
  --vis-tooltip-label-color: light-dark(#52525b, #d4d4d8);
  --vis-tooltip-value-color: light-dark(#111827, #fafafa);
  --vis-tooltip-shadow-color: light-dark(rgba(24, 24, 27, 0.12), rgba(0, 0, 0, 0.35));
  --vis-tooltip-title-color: light-dark(#111827, #fafafa);
  --vis-tooltip-title-border-bottom: 1px solid light-dark(rgba(24, 24, 27, 0.08), rgba(255, 255, 255, 0.1));
  --vis-tooltip-title-text-transform: none;
  --vis-tooltip-title-font-size: 0.9rem;
  --vis-tooltip-title-font-weight: 700;
  --vis-tooltip-title-padding: 0.75rem 0.75rem 0.5rem 0.75rem;
  --vis-tooltip-content-padding: 0 0.75rem 0.65rem 0.75rem;
  --vis-tooltip-label-font-size: 0.85rem;
  --vis-tooltip-value-font-size: 0.85rem;
  --vis-tooltip-value-font-weight: 700;
  --vis-donut-segment-stroke-color: var(--ui-bg);
  --vis-legend-spacing: 0.75rem;
}
</style>
