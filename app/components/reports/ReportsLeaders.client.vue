<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { BarChart } from 'vue-chrts'
import { Orientation } from 'vue-chrts/enums'
import { lineCategoryColors, lineCategoryLabels } from '~~/shared/constants/pos'
import type { ReportsLeaders } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

type RankingKind = 'customers' | 'items'
type CustomerMetric = 'total' | 'documentCount'
type ItemMetric = 'total' | 'quantity'
type UiColorToken = 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
type CustomerRow = {
  key: string
  label: string
  total: number
  documentCount: number
  share: number
}
type ItemRow = {
  key: string
  label: string
  category: ReportsLeaders['topItems'][number]['category']
  total: number
  quantity: number
  share: number
}

const props = defineProps<{
  kind: RankingKind
  leaders: ReportsLeaders
}>()

const customerMetric = ref<CustomerMetric>('total')
const itemMetric = ref<ItemMetric>('total')

const customerMetricTabs: TabsItem[] = [
  { label: 'CA', value: 'total' },
  { label: 'Documents', value: 'documentCount' }
]

const itemMetricTabs: TabsItem[] = [
  { label: 'CA', value: 'total' },
  { label: 'Quantité', value: 'quantity' }
]

function toChartColor(color: UiColorToken) {
  return `var(--ui-color-${color}-500)`
}

function formatInteger(value: number | Date) {
  return new Intl.NumberFormat('fr-CH').format(Number(value))
}

const config = computed(() => {
  if (props.kind === 'customers') {
    return {
      title: 'Top clients',
      description: 'Classement des clients sur la période sélectionnée.',
      icon: 'i-lucide-users',
      emptyTitle: 'Aucun client à classer',
      emptyDescription: 'Les clients encaissés sur la période apparaîtront ici.'
    }
  }

  return {
    title: 'Top articles',
    description: 'Classement des lignes encaissées sur la période sélectionnée.',
    icon: 'i-lucide-package',
    emptyTitle: 'Aucun article à classer',
    emptyDescription: 'Les articles encaissés sur la période apparaîtront ici.'
  }
})

const customerRows = computed<CustomerRow[]>(() => {
  return props.leaders.topCustomers.map(item => ({
    key: String(item.customerId),
    label: item.customerName,
    total: item.total,
    documentCount: item.documentCount,
    share: props.leaders.totalPaid > 0 ? item.total / props.leaders.totalPaid : 0
  }))
})

const itemRows = computed<ItemRow[]>(() => {
  return props.leaders.topItems.map(item => ({
    ...item,
    share: props.leaders.totalPaid > 0 ? item.total / props.leaders.totalPaid : 0
  }))
})

const activeMetric = computed<CustomerMetric | ItemMetric>(() => {
  return props.kind === 'customers' ? customerMetric.value : itemMetric.value
})

const selectedMetric = computed<CustomerMetric | ItemMetric>({
  get() {
    return props.kind === 'customers' ? customerMetric.value : itemMetric.value
  },
  set(value) {
    if (props.kind === 'customers') {
      customerMetric.value = value as CustomerMetric
      return
    }

    itemMetric.value = value as ItemMetric
  }
})

const rankingRows = computed<Array<CustomerRow | ItemRow>>(() => {
  if (props.kind === 'customers') {
    return [...customerRows.value].sort((left, right) =>
      right[customerMetric.value] - left[customerMetric.value]
      || right.total - left.total
      || left.label.localeCompare(right.label, 'fr-CH')
    )
  }

  return [...itemRows.value].sort((left, right) =>
    right[itemMetric.value] - left[itemMetric.value]
    || right.total - left.total
    || left.label.localeCompare(right.label, 'fr-CH')
  )
})

function metricValue(item: CustomerRow | ItemRow) {
  if (props.kind === 'customers') {
    const customer = item as CustomerRow
    return activeMetric.value === 'total' ? customer.total : customer.documentCount
  }

  const rankingItem = item as ItemRow
  return activeMetric.value === 'total' ? rankingItem.total : rankingItem.quantity
}

const chartData = computed(() => {
  return rankingRows.value.map(item => ({
    label: item.label,
    value: metricValue(item)
  }))
})

const categories = computed(() => ({
  value: {
    name: props.kind === 'customers'
      ? activeMetric.value === 'total' ? 'CA encaissé' : 'Documents'
      : activeMetric.value === 'total' ? 'CA encaissé' : 'Quantité vendue',
    color: toChartColor(
      activeMetric.value === 'quantity'
        ? 'success'
        : props.kind === 'customers'
          ? 'primary'
          : 'info'
    )
  }
}))

const chartHeight = computed(() => Math.max(220, chartData.value.length * 46))

const axisLabel = (tick: number | Date) => {
  const index = Math.round(Number(tick))
  return chartData.value[index]?.label || ''
}

const valueLabel = (tick: number | Date) => {
  return activeMetric.value === 'total'
    ? formatCurrency(Number(tick))
    : formatInteger(tick)
}

function metricSummary(item: CustomerRow | ItemRow) {
  if (props.kind === 'customers') {
    const customer = item as CustomerRow
    return activeMetric.value === 'total'
      ? `${formatInteger(customer.documentCount)} document${customer.documentCount > 1 ? 's' : ''}`
      : formatCurrency(customer.total)
  }

  const rankingItem = item as ItemRow
  return activeMetric.value === 'total'
    ? `${formatInteger(rankingItem.quantity)} unité${rankingItem.quantity > 1 ? 's' : ''}`
    : formatCurrency(rankingItem.total)
}

function itemCategory(item: CustomerRow | ItemRow) {
  return props.kind === 'items' ? (item as ItemRow).category : null
}
</script>

<template>
  <UCard class="reports-leaders" :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }">
    <template #header>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-base font-semibold text-highlighted">
            {{ config.title }}
          </h2>
          <p class="text-sm text-toned">
            {{ config.description }}
          </p>
        </div>

        <UTabs
          v-model="selectedMetric"
          :items="props.kind === 'customers' ? customerMetricTabs : itemMetricTabs"
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
      v-if="rankingRows.length"
      class="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
    >
      <div class="overflow-hidden rounded-2xl border border-default/80 bg-muted/20 px-3 py-3">
        <BarChart
          :data="chartData"
          :categories="categories"
          :height="chartHeight"
          :y-axis="['value']"
          :orientation="Orientation.Horizontal"
          :padding="{ top: 6, right: 12, bottom: 0, left: 0 }"
          :radius="10"
          :x-grid-line="true"
          :x-tick-line="false"
          :y-grid-line="false"
          :y-tick-line="false"
          :hide-legend="true"
          :x-formatter="valueLabel"
          :y-formatter="axisLabel"
          :tooltip-title-formatter="(item) => item.label"
        />
      </div>

      <div class="rounded-2xl border border-default/80 bg-muted/15">
        <ol class="divide-y divide-default">
          <li
            v-for="(item, index) in rankingRows"
            :key="item.key"
            class="flex items-start gap-3 px-4 py-3"
          >
            <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-semibold text-toned ring ring-default">
              {{ index + 1 }}
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ item.label }}
                  </p>
                  <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-toned">
                    <span>{{ metricSummary(item) }}</span>
                    <span>•</span>
                    <span>{{ Math.round(item.share * 100) }}% du CA</span>
                    <UBadge
                      v-if="itemCategory(item)"
                      :label="lineCategoryLabels[itemCategory(item)!]"
                      :color="lineCategoryColors[itemCategory(item)!]"
                      variant="subtle"
                      size="sm"
                    />
                  </div>
                </div>

                <p class="shrink-0 text-sm font-semibold text-highlighted">
                  {{
                    activeMetric === 'total'
                      ? formatCurrency(metricValue(item))
                      : formatInteger(metricValue(item))
                  }}
                </p>
              </div>
            </div>
          </li>
        </ol>
      </div>
    </div>

    <UEmpty
      v-else
      :icon="config.icon"
      :title="config.emptyTitle"
      :description="config.emptyDescription"
    />
  </UCard>
</template>

<style scoped>
.reports-leaders {
  --vis-axis-grid-color: color-mix(in srgb, var(--ui-border) 86%, transparent);
  --vis-axis-tick-color: var(--ui-border);
  --vis-axis-tick-label-color: var(--ui-text-dimmed);
  --vis-tooltip-background-color: light-dark(#ffffff, #18181b);
  --vis-tooltip-border-color: light-dark(rgba(24, 24, 27, 0.12), rgba(255, 255, 255, 0.12));
  --vis-tooltip-text-color: light-dark(#18181b, #fafafa);
  --vis-tooltip-label-color: light-dark(#52525b, #d4d4d8);
  --vis-tooltip-value-color: light-dark(#111827, #fafafa);
  --vis-tooltip-shadow-color: light-dark(rgba(24, 24, 27, 0.12), rgba(0, 0, 0, 0.35));
}
</style>
