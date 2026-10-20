<script setup lang="ts">
import type { ChartCategory, TabsItem } from '@nuxt/ui'
import { barY, defineChart, ruleY, text } from '@tanstack/charts'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal'
import { lineCategoryColors, paymentMethodColors, paymentMethodLabels } from '~~/shared/constants/pos'
import type { PaymentMethod, ReportsOverview } from '~~/shared/types/pos'
import { formatCurrency, formatDate } from '~~/shared/utils/pos'

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

const activePaymentPeriod = computed(() => props.overview.paymentPeriods.find(period => period.key === selectedPaymentPeriod.value) || props.overview.paymentPeriods[0])
const paymentsChartData = computed(() => activePaymentPeriod.value?.buckets || [])

const paymentSeries: Array<{ method: PaymentMethod, key: 'cash' | 'cardTwint' | 'bankTransfer' | 'stripe' | 'shopify' }> = [
  { method: 'cash', key: 'cash' },
  { method: 'card_twint', key: 'cardTwint' },
  { method: 'bank_transfer', key: 'bankTransfer' },
  { method: 'stripe', key: 'stripe' },
  { method: 'shopify', key: 'shopify' }
]
const paymentColors = paymentSeries.map(({ method }) => paymentMethodColors[method] === 'neutral' ? 'var(--ui-bg-inverted)' : `var(--ui-${paymentMethodColors[method]})`)
const paymentStackTop = (bucket: PaymentBucket) => paymentSeries.reduce((sum, { key }) => sum + Math.max(0, bucket[key]), 0)
const paymentChartRange = computed(() => {
  const maximum = Math.max(0, ...paymentsChartData.value.map(paymentStackTop))
  const minimum = Math.min(0, ...paymentsChartData.value.map(bucket => paymentSeries.reduce((sum, { key }) => sum + Math.min(0, bucket[key]), 0)))
  return { minimum, maximum, span: Math.max(maximum - minimum, 100) }
})
const paymentChartMinWidth = computed(() => {
  const labelWidth = Math.max(84, ...paymentsChartData.value.map(bucket => formatCurrency(bucket.total).length * 6 + 6))
  return `${paymentsChartData.value.length * labelWidth + 80}px`
})
const paymentsDefinition = computed(() => {
  const { minimum, maximum, span } = paymentChartRange.value
  const rows = paymentsChartData.value.flatMap(bucket => paymentSeries.map(({ method, key }) => ({
    date: bucket.date,
    method,
    value: bucket[key]
  })))
  return defineChart({
    marks: [
      // barY uses a diverging stack: refunds stay below zero, receipts above it.
      barY(rows, { x: 'date', y: 'value', z: 'method', color: 'method', radius: { end: 6, stack: 'outer' } }),
      ruleY([0]),
      text(paymentsChartData.value, {
        x: 'date',
        y: bucket => paymentStackTop(bucket) + span * 0.055,
        text: bucket => formatCurrency(bucket.total),
        fontSize: 11,
        fill: 'var(--ui-text-highlighted)'
      })
    ],
    scales: {
      x: {
        scale: scaleBand<string>().domain(paymentsChartData.value.map(bucket => bucket.date)).padding(0.25),
        axis: { ticks: { format: value => paymentsChartData.value.find(bucket => bucket.date === value)?.label || String(value) } }
      },
      y: {
        scale: scaleLinear().domain([minimum < 0 ? minimum - span * 0.04 : 0, maximum + span * 0.14]),
        grid: true,
        axis: { ticks: { format: value => formatCurrency(Number(value)) } }
      }
    },
    color: {
      scale: scaleOrdinal<string, string>().domain(paymentSeries.map(({ method }) => method)).range(paymentColors)
    },
    focus: 'group-x',
    maxFocusDistance: Number.POSITIVE_INFINITY
  })
})

const hoveredPayment = ref<PaymentBucket>()
watch(activePaymentPeriod, () => {
  hoveredPayment.value = undefined
})
const hasPaymentActivity = computed(() => paymentsChartData.value.some(day => paymentSeries.some(({ key }) => day[key] !== 0)))
const turnoverChartData = computed(() => props.overview.turnoverByCategory)
const turnoverColors = computed(() => turnoverChartData.value.map(item => lineCategoryColors[item.category]))
const turnoverTotal = computed(() => turnoverChartData.value.reduce((sum, item) => sum + item.total, 0))
const hasTurnoverActivity = computed(() => turnoverTotal.value > 0)

// Keep the ticket dates independent from the selected payment period.
const ticketChartData = computed(() => props.overview.ticketFlowByDay)
const ticketCategories: ChartCategory<ReportsOverview['ticketFlowByDay'][number]>[] = [
  { key: 'opened', label: 'Ouverts', color: 'primary' },
  { key: 'closed', label: 'Clôturés', color: 'success' }
]
const hasTicketActivity = computed(() => ticketChartData.value.some(day => day.opened > 0 || day.closed > 0))
const integerLabel = (value: number) => Number.isInteger(value) ? new Intl.NumberFormat('fr-CH').format(value) : ''
</script>

<template>
  <div class="space-y-4">
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
            <UChart
              :key="selectedPaymentPeriod"
              :definition="paymentsDefinition"
              :height="320"
              aria-label="Encaissements nets par mode de paiement"
              aria-description="Les encaissements sont au-dessus de zéro, les remboursements en dessous. Les étiquettes indiquent le total net."
              @focus-change="point => hoveredPayment = point ? paymentsChartData.find(bucket => bucket.date === point.xValue) : undefined"
            >
              <template #tooltip>
                <div v-if="hoveredPayment" class="w-64 max-w-[calc(100vw-4rem)] space-y-2 p-1 text-sm">
                  <p class="font-semibold text-highlighted">
                    {{ hoveredPayment.tooltipLabel }}
                  </p>
                  <div v-for="(series, index) in paymentSeries" :key="series.key" class="flex items-center gap-2">
                    <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: paymentColors[index] }" />
                    <span class="flex-1 text-toned">{{ paymentMethodLabels[series.method] }}</span>
                    <span class="font-medium whitespace-nowrap text-highlighted tabular-nums">{{ formatCurrency(hoveredPayment[series.key]) }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-4 border-t border-default pt-2 font-semibold text-highlighted">
                    <span>Total net</span>
                    <span class="whitespace-nowrap tabular-nums">{{ formatCurrency(hoveredPayment.total) }}</span>
                  </div>
                </div>
              </template>
            </UChart>
          </div>
        </div>
        <ul class="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-toned" aria-label="Modes de paiement">
          <li v-for="(series, index) in paymentSeries" :key="series.key" class="flex items-center gap-1.5">
            <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: paymentColors[index] }" />
            {{ paymentMethodLabels[series.method] }}
          </li>
        </ul>
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
          <UChart
            type="donut"
            :data="turnoverChartData"
            index="label"
            :categories="['total']"
            :colors="turnoverColors"
            :height="248"
            :thickness="20"
            :format="formatCurrency"
            aria-label="Factures soldées par catégorie"
          >
            <template #center>
              <div class="space-y-1 text-center">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Valeur nette
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ formatCurrency(turnoverTotal) }}
                </p>
              </div>
            </template>
          </UChart>
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
          <UChart
            type="bar"
            :data="ticketChartData"
            index="label"
            :categories="ticketCategories"
            :height="248"
            :format="integerLabel"
            aria-label="Ouvertures et clôtures de dossiers sur sept jours"
          >
            <template #tooltip="{ title, rows }">
              <p class="font-semibold text-highlighted">
                {{ formatDate(ticketChartData.find(day => day.label === title)?.date || '') }}
              </p>
              <div v-for="row in rows" :key="row.label" class="flex items-center gap-2 text-sm">
                <span class="size-2 rounded-full" :style="{ backgroundColor: row.color }" />
                <span class="flex-1 text-toned">{{ row.label }}</span>
                <span class="font-medium tabular-nums">{{ row.value }}</span>
              </div>
            </template>
          </UChart>
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
