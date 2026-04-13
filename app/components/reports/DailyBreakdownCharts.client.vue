<script setup lang="ts">
import { Orientation } from 'vue-chrts'
import { lineCategoryColors, lineCategoryLabels, paymentMethodLabels } from '~~/shared/constants/pos'
import type { DailySummary } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

type BreakdownKind = 'payments' | 'turnover'
type ChartColorToken = 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

const props = defineProps<{
  kind: BreakdownKind
  summary: DailySummary
}>()

function toChartColor(color: ChartColorToken) {
  return `var(--ui-color-${color}-500)`
}

const paymentChartData = computed(() => {
  return props.summary.totalsByMethod.map(item => ({
    label: paymentMethodLabels[item.method],
    total: item.total,
    method: item.method
  }))
})

const paymentCategories = computed(() => ({
  total: {
    name: 'Encaissé',
    color: toChartColor('primary')
  }
}))

const paymentChartHeight = computed(() => Math.max(176, paymentChartData.value.length * 44))

const paymentAxisLabel = (tick: number | Date) => {
  const index = Math.round(Number(tick))
  return paymentChartData.value[index]?.label || ''
}

const paymentValueLabel = (tick: number | Date) => {
  return formatCurrency(Number(tick))
}

const paymentTooltipTitle = (item: { label: string }) => item.label

const turnoverChartData = computed(() => {
  return props.summary.turnoverByCategory.map(item => ({
    label: lineCategoryLabels[item.category],
    total: item.total,
    category: item.category
  }))
})

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

const turnoverTooltipTitle = (item: { label?: string }) => item.label || ''
</script>

<template>
  <div class="daily-breakdown-chart">
    <div
      v-if="kind === 'payments' && paymentChartData.length"
      class="overflow-hidden rounded-2xl border border-default/80 bg-muted/20 px-3 py-3"
    >
      <BarChart
        :data="paymentChartData"
        :categories="paymentCategories"
        :height="paymentChartHeight"
        :y-axis="['total']"
        :orientation="Orientation.Horizontal"
        :padding="{ top: 6, right: 12, bottom: 0, left: 0 }"
        :radius="10"
        :x-grid-line="true"
        :x-tick-line="false"
        :y-grid-line="false"
        :y-tick-line="false"
        :hide-legend="true"
        :tooltip-title-formatter="paymentTooltipTitle"
        :x-formatter="paymentValueLabel"
        :y-formatter="paymentAxisLabel"
      />
    </div>

    <div
      v-else-if="kind === 'turnover' && turnoverChartData.length"
      class="overflow-hidden rounded-2xl border border-default/80 bg-muted/20 px-3 py-4"
    >
      <DonutChart
        :data="turnoverChartData.map(item => item.total)"
        :categories="turnoverCategories"
        :height="224"
        :radius="72"
        :arc-width="18"
        :pad-angle="0.02"
        :hide-legend="true"
        :tooltip-title-formatter="turnoverTooltipTitle"
      >
        <div class="space-y-1 text-center">
          <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
            Total
          </p>
          <p class="text-sm font-semibold text-highlighted">
            {{ formatCurrency(turnoverTotal) }}
          </p>
        </div>
      </DonutChart>
    </div>
  </div>
</template>

<style scoped>
.daily-breakdown-chart {
  --vis-axis-grid-color: var(--ui-border);
  --vis-axis-tick-color: var(--ui-border);
  --vis-axis-tick-label-color: var(--ui-text-dimmed);
  --vis-tooltip-background-color: var(--ui-bg);
  --vis-tooltip-border-color: var(--ui-border);
  --vis-tooltip-text-color: var(--ui-text-highlighted);
  --vis-donut-segment-stroke-color: var(--ui-bg);
  --vis-legend-spacing: 0.75rem;
}
</style>
