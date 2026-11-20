<script setup lang="ts">
import type { ChartCategory } from '@nuxt/ui'
import { paymentCategoryLabels } from '~~/shared/types/payment-categories'
import type { ReportsCategories } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

const props = defineProps<{
  report: ReportsCategories
}>()

const turnoverChartData = computed(() => props.report.paymentCategories.map(item => ({
  ...item,
  label: item.category ? paymentCategoryLabels[item.category] : 'À catégoriser'
})))
const turnoverColors = computed(() => turnoverChartData.value.map(item => ({
  repair: 'warning', accessory: 'info', service: 'success', device_new: 'primary', device_refurbished: 'secondary', other: 'neutral'
}[item.category || 'other'])))
const turnoverTotal = computed(() => turnoverChartData.value.reduce((sum, item) => sum + item.total, 0))
// A donut cannot represent negative categories or a zero net total honestly.
const hasTurnoverActivity = computed(() => turnoverTotal.value > 0 && turnoverChartData.value.every(item => item.total >= 0))

const ticketChartData = computed(() => props.report.ticketFlow)
const ticketIntervalLabel = computed(() => ({ day: 'jour', month: 'mois', year: 'année' })[props.report.ticketInterval])
const ticketCategories: ChartCategory<ReportsCategories['ticketFlow'][number]>[] = [
  { key: 'opened', label: 'Ouverts', color: 'primary' },
  { key: 'closed', label: 'Clôturés', color: 'success' }
]
const hasTicketActivity = computed(() => ticketChartData.value.some(day => day.opened > 0 || day.closed > 0))
const integerLabel = (value: number) => Number.isInteger(value) ? new Intl.NumberFormat('fr-CH').format(value) : ''
const invoicedTotal = computed(() => props.report.turnoverByCategory.reduce((sum, item) => sum + item.total, 0))
</script>

<template>
  <div class="grid items-start gap-4 xl:grid-cols-2">
    <UCard class="xl:row-span-2" :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }">
      <template #header>
        <div class="flex flex-col gap-1">
          <h2 class="text-base font-semibold text-highlighted">
            Encaissements par catégorie
          </h2>
          <p class="text-sm text-toned">
            Acomptes inclus, remboursements déduits.
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
          :height="208"
          :thickness="20"
          :format="formatCurrency"
          aria-label="Encaissements par catégorie"
        >
          <template #center>
            <div class="space-y-1 text-center">
              <p class="text-xs text-toned">
                Encaissé net
              </p>
              <p class="text-sm font-semibold text-highlighted">
                {{ formatCurrency(turnoverTotal) }}
              </p>
            </div>
          </template>
        </UChart>
      </div>

      <table v-if="turnoverChartData.length" class="pos-data-table w-full text-sm tabular-nums">
        <thead>
          <tr class="text-left text-muted">
            <th scope="col" class="pb-2 font-medium">
              Catégorie
            </th>
            <th scope="col" class="pb-2 text-right font-medium">
              Montant net
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="item in turnoverChartData" :key="item.category || 'uncategorized'">
            <th scope="row" class="py-2 text-left font-normal" :class="item.category === null ? 'text-error' : ''">
              {{ item.label }}
            </th>
            <td class="py-2 text-right whitespace-nowrap" :class="item.total < 0 ? 'text-error' : ''">
              {{ formatCurrency(item.total) }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t border-default font-semibold">
            <th scope="row" class="pt-2 text-left">
              Encaissement net
            </th>
            <td class="pt-2 text-right whitespace-nowrap">
              {{ formatCurrency(turnoverTotal) }}
            </td>
          </tr>
        </tfoot>
      </table>

      <UEmpty
        v-else
        icon="i-lucide-chart-pie"
        title="Aucun mouvement sur cette période"
        description="Les paiements apparaîtront ici, y compris ceux qui restent à catégoriser."
      />

      <UButton
        to="/reports/daily"
        label="Catégoriser dans Fin de journée"
        icon="i-lucide-tags"
        color="neutral"
        variant="link"
        size="sm"
        class="px-0"
      />
    </UCard>

    <UCard :ui="{ body: 'space-y-3 p-4', header: 'p-4 pb-0' }">
      <template #header>
        <h2 class="text-base font-semibold text-highlighted">
          Ventes facturées par catégorie
        </h2>
        <p class="mt-1 text-sm text-toned">
          Factures émises, réglées ou non, moins les réductions commerciales de la période. Catégories des lignes de facture.
        </p>
      </template>

      <table v-if="report.turnoverByCategory.length" class="pos-data-table w-full text-sm tabular-nums">
        <thead>
          <tr class="text-left text-muted">
            <th scope="col" class="pb-2 font-medium">
              Catégorie
            </th>
            <th scope="col" class="pb-2 text-right font-medium">
              Montant TTC
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="item in report.turnoverByCategory" :key="item.category || 'uncategorized'">
            <th scope="row" class="py-2 text-left font-normal">
              {{ item.label }}
            </th>
            <td class="py-2 text-right whitespace-nowrap" :class="item.total < 0 ? 'text-error' : ''">
              {{ formatCurrency(item.total) }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t border-default font-semibold">
            <th scope="row" class="pt-2 text-left">
              Total facturé net
            </th>
            <td class="pt-2 text-right whitespace-nowrap">
              {{ formatCurrency(invoicedTotal) }}
            </td>
          </tr>
        </tfoot>
      </table>
      <p v-else class="text-sm text-toned">
        Aucune facture émise ni réduction commerciale sur cette période.
      </p>
    </UCard>

    <UCard :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }">
      <template #header>
        <div class="flex flex-col gap-1">
          <h2 class="text-base font-semibold text-highlighted">
            Ouvertures et clôtures de dossiers
          </h2>
          <p class="text-sm text-toned">
            Nombre de dossiers par {{ ticketIntervalLabel }}.
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
          :height="180"
          :format="integerLabel"
          :aria-label="`Ouvertures et clôtures de dossiers par ${ticketIntervalLabel}`"
        >
          <template #tooltip="{ title, rows }">
            <p class="font-semibold text-highlighted">
              {{ title }}
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
</template>
