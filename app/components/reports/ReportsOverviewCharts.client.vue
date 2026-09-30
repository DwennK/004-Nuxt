<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { StackedBar, XYLabels } from '@unovis/ts'
import { VisAxis, VisBulletLegend, VisStackedBar, VisTooltip, VisXYContainer, VisXYLabels } from '@unovis/vue'
import { BarChart, DonutChart } from 'vue-chrts'
import { lineCategoryColors, paymentMethodColors, paymentMethodLabels } from '~~/shared/constants/pos'
import type { PaymentMethod, ReportsOverview } from '~~/shared/types/pos'
import { formatCurrency, formatDate } from '~~/shared/utils/pos'

type UiColorToken = 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
type PaymentBucket = ReportsOverview['paymentPeriods'][number]['buckets'][number]

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

const paymentsChartData = computed(() => (activePaymentPeriod.value?.buckets || []).map((bucket, index) => ({ ...bucket, index })))

const paymentSeries: Array<{
  method: PaymentMethod
  key: keyof ReportsOverview['paymentPeriods'][number]['buckets'][number]
}> = [
  { method: 'cash', key: 'cash' },
  { method: 'card_twint', key: 'cardTwint' },
  { method: 'bank_transfer', key: 'bankTransfer' },
  { method: 'stripe', key: 'stripe' },
  { method: 'shopify', key: 'shopify' }
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

const paymentAccessors = paymentSeries.map(({ key }) => (bucket: PaymentBucket) => Number(bucket[key]))
const paymentColor = (_bucket: PaymentBucket, index: number) => toChartColor(paymentMethodColors[paymentSeries[index]!.method])
const paymentIndex = (bucket: PaymentBucket & { index: number }) => bucket.index
const paymentTotalLabel = (bucket: PaymentBucket) => formatCurrency(bucket.total)

const paymentStackTop = (bucket: PaymentBucket) => paymentAccessors.reduce((sum, accessor) => sum + Math.max(0, accessor(bucket)), 0)
const paymentChartRange = computed(() => {
  const maximum = Math.max(0, ...paymentsChartData.value.map(paymentStackTop))
  const minimum = Math.min(0, ...paymentsChartData.value.map(bucket => paymentAccessors.reduce((sum, accessor) => sum + Math.min(0, accessor(bucket)), 0)))
  return { minimum, maximum, span: Math.max(maximum - minimum, 100) }
})
// Position totals above the positive stack, including when refunds reduce the net total.
const paymentLabelY = (bucket: PaymentBucket) => paymentStackTop(bucket) + paymentChartRange.value.span * 0.055
const paymentYDomain = computed<[number, number]>(() => {
  const { minimum, maximum, span } = paymentChartRange.value
  return [minimum < 0 ? minimum - span * 0.04 : 0, maximum + span * 0.14]
})
const paymentChartMinWidth = computed(() => {
  const labelWidth = Math.max(84, ...paymentsChartData.value.map(bucket => paymentTotalLabel(bucket).length * 6 + 6))
  return `${paymentsChartData.value.length * labelWidth + 80}px`
})

const paymentTooltipContainer = import.meta.client ? document.body : undefined
const paymentTooltip = useTemplateRef<HTMLDivElement>('paymentTooltip')
const hoveredPayment = ref<PaymentBucket>()

function showPaymentTooltip(value: PaymentBucket | { datum: PaymentBucket }) {
  hoveredPayment.value = 'datum' in value ? value.datum : value
  if (!paymentTooltip.value) return ''
  paymentTooltip.value.style.display = ''
  return paymentTooltip.value
}

const paymentTooltipTriggers = {
  [StackedBar.selectors.bar]: showPaymentTooltip,
  [XYLabels.selectors.label]: showPaymentTooltip
}

watch(activePaymentPeriod, () => {
  hoveredPayment.value = undefined
})

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

const hasPaymentActivity = computed(() => paymentsChartData.value.some(day => paymentSeries.some(series => Number(day[series.key]) !== 0)))

const dayLabel = (tick: number | Date) => {
  const index = Math.round(Number(tick))
  return paymentsChartData.value[index]?.label || ''
}

const currencyLabel = (tick: number | Date) => formatCurrency(Number(tick))

function formatTooltipDate(date: string) {
  return formatDate(date)
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
              Encaissements nets
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
        class="space-y-3 rounded-2xl border border-default/80 bg-muted/20 p-3"
      >
        <div
          class="overflow-x-auto"
          tabindex="0"
          role="region"
          aria-label="Encaissements nets par période, graphique défilant"
        >
          <div :style="{ minWidth: paymentChartMinWidth }">
            <VisXYContainer
              :key="selectedPaymentPeriod"
              :data="paymentsChartData"
              :height="320"
              :padding="{ top: 12, right: 12, bottom: 0, left: 0 }"
              :x-domain="[-0.5, paymentsChartData.length - 0.5]"
              :y-domain="paymentYDomain"
            >
              <VisStackedBar
                :x="paymentIndex"
                :y="paymentAccessors"
                :color="paymentColor"
                :rounded-corners="10"
                :group-padding="18"
                :bar-padding="0.12"
              />
              <VisXYLabels
                :x="paymentIndex"
                :y="paymentLabelY"
                :label="paymentTotalLabel"
                :clustering="false"
                :label-font-size="11"
                color="var(--ui-text-highlighted)"
                background-color="transparent"
              />
              <VisAxis
                type="x"
                :tick-values="paymentTicks"
                :tick-format="dayLabel"
                :grid-line="false"
                :tick-line="false"
                :domain-line="false"
              />
              <VisAxis
                type="y"
                :tick-format="currencyLabel"
                :grid-line="true"
                :tick-line="false"
                :domain-line="false"
              />
              <VisTooltip
                :triggers="paymentTooltipTriggers"
                :container="paymentTooltipContainer"
                class-name="reports-payment-tooltip"
              />
            </VisXYContainer>
          </div>
        </div>
        <VisBulletLegend :items="Object.values(paymentsCategories)" class="flex flex-wrap justify-center gap-x-3 gap-y-1" />
        <div ref="paymentTooltip" style="display: none">
          <div v-if="hoveredPayment" class="w-72 max-w-[calc(100vw-7rem)] space-y-2 p-3 text-sm">
            <p class="font-semibold text-highlighted">
              {{ hoveredPayment.tooltipLabel }}
            </p>
            <div v-for="series in paymentSeries" :key="series.key" class="flex items-center gap-2">
              <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: toChartColor(paymentMethodColors[series.method]) }" />
              <span class="flex-1 text-toned">{{ paymentMethodLabels[series.method] }}</span>
              <span class="font-medium whitespace-nowrap text-highlighted tabular-nums">{{ formatCurrency(Number(hoveredPayment[series.key])) }}</span>
            </div>
            <div class="flex items-center justify-between gap-4 border-t border-default pt-2 font-semibold text-highlighted">
              <span>Total net</span>
              <span class="whitespace-nowrap tabular-nums">{{ formatCurrency(hoveredPayment.total) }}</span>
            </div>
          </div>
        </div>
      </div>

      <UEmpty
        v-else
        icon="i-lucide-chart-column-stacked"
        title="Aucun mouvement net sur la période"
        description="Les encaissements et remboursements de la période se compensent ou sont absents."
      />
    </UCard>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <UCard :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }">
        <template #header>
          <div class="flex flex-col gap-1">
            <h2 class="text-base font-semibold text-highlighted">
              Factures soldées par catégorie
            </h2>
            <p class="text-sm text-toned">
              Valeur des factures soldées après réductions commerciales.
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
                Valeur nette
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
              Flux dossiers
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
          title="Aucune variation de dossiers"
          description="Les ouvertures et clôtures apparaîtront ici dès qu’il y aura de l’activité."
        />
      </UCard>
    </div>
  </div>
</template>

<style scoped>
:global(.reports-payment-tooltip) {
  --vis-tooltip-background-color: var(--ui-bg);
  --vis-tooltip-border-color: var(--ui-border);
  --vis-tooltip-text-color: var(--ui-text);
  --vis-tooltip-shadow-color: color-mix(in srgb, var(--ui-text) 12%, transparent);
}

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
