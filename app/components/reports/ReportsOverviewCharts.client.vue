<script setup lang="ts">
import { lineCategoryColors, paymentMethodColors, paymentMethodLabels } from '~~/shared/constants/pos'
import type { ReportsOverview } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

type UiColorToken = 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

const props = defineProps<{
  overview: ReportsOverview
}>()

function toChartColor(color: UiColorToken) {
  return `var(--ui-color-${color}-500)`
}

const paymentsChartData = computed(() => props.overview.paymentsByDay)

const paymentsCategories = {
  cash: {
    name: paymentMethodLabels.cash,
    color: toChartColor(paymentMethodColors.cash)
  },
  card: {
    name: paymentMethodLabels.card,
    color: toChartColor(paymentMethodColors.card)
  },
  twint: {
    name: paymentMethodLabels.twint,
    color: toChartColor(paymentMethodColors.twint)
  },
  bankTransfer: {
    name: paymentMethodLabels.bank_transfer,
    color: toChartColor(paymentMethodColors.bank_transfer)
  }
}

const paymentTicks = computed(() => paymentsChartData.value.map((_, index) => index))

const hasPaymentActivity = computed(() => paymentsChartData.value.some(day => day.total > 0))

const dayLabel = (tick: number | Date) => {
  const index = Math.round(Number(tick))
  return props.overview.range.labels[index] || ''
}

const currencyLabel = (tick: number | Date) => formatCurrency(Number(tick))

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
        <div class="flex flex-col gap-1">
          <h2 class="text-base font-semibold text-highlighted">
            Encaissements sur 7 jours
          </h2>
          <p class="text-sm text-toned">
            Total journalier avec ventilation par mode de paiement.
          </p>
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
          :y-axis="['cash', 'card', 'twint', 'bankTransfer']"
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
        />
      </div>

      <UEmpty
        v-else
        icon="i-lucide-chart-column-stacked"
        title="Aucun encaissement sur la période"
        description="Les 7 derniers jours sélectionnés ne contiennent encore aucun paiement encaissé."
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
  --vis-tooltip-background-color: var(--ui-bg);
  --vis-tooltip-border-color: var(--ui-border);
  --vis-tooltip-text-color: var(--ui-text-highlighted);
  --vis-tooltip-label-color: var(--ui-text-toned);
  --vis-tooltip-shadow-color: color-mix(in srgb, black 10%, transparent);
  --vis-donut-segment-stroke-color: var(--ui-bg);
  --vis-legend-spacing: 0.75rem;
}
</style>
