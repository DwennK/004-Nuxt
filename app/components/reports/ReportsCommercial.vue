<script setup lang="ts">
import type { CommercialReport } from '~~/shared/types/pos'
import { lineCategoryLabels } from '~~/shared/constants/pos'
import { formatCurrency, formatDate } from '~~/shared/utils/pos'

const date = defineModel<string>('date', { required: true })
const period = defineModel<CommercialReport['period']>('period', { required: true })
const periods = [{ label: 'Jour', value: 'day' }, { label: 'Mois', value: 'month' }, { label: 'Année', value: 'year' }]
const pickerType = computed(() => period.value === 'day' ? 'date' : period.value)
const { data: report, status, error, refresh } = await useFetch<CommercialReport>('/api/reports/commercial', {
  key: 'reports-commercial',
  lazy: true,
  query: computed(() => ({ date: date.value, period: period.value })),
  watch: false
})
watch([date, period], () => refresh(), { flush: 'post' })

const stats = computed(() => report.value
  ? [
      { label: 'Facturé TTC', value: formatCurrency(report.value.totals.invoicedTotal) },
      { label: 'Réductions commerciales', value: formatCurrency(report.value.totals.creditTotal) },
      { label: 'Net commercial TTC', value: formatCurrency(report.value.totals.total) },
      { label: 'Factures émises', value: String(report.value.totals.invoiceCount) }
    ]
  : [])

function bucketLabel(value: string) {
  return value.length === 7 ? `${value.slice(5)}/${value.slice(0, 4)}` : formatDate(value)
}
</script>

<template>
  <div class="space-y-4">
    <ReportsPeriodBar
      v-model:date="date"
      :type="pickerType"
      :loading="status === 'pending'"
      @refresh="refresh()"
    >
      <UTabs
        v-model="period"
        :items="periods"
        :content="false"
        aria-label="Type de période"
        color="neutral"
        size="xs"
        class="w-auto"
      />
    </ReportsPeriodBar>
    <p class="text-sm text-toned">
      Chaque facture est comptée une fois à sa date d’émission, réglée ou non. Les réductions commerciales sont déduites à leur date d’enregistrement. Devis, commandes, brouillons et factures annulées sont exclus.
    </p>
    <PosAsyncState v-if="error" :error="error" @retry="refresh()" />
    <PosAsyncState v-else-if="status === 'pending' || status === 'idle'" loading loading-label="Chargement des ventes facturées" />
    <template v-else-if="report">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UCard v-for="stat in stats" :key="stat.label" :ui="{ body: 'p-4' }">
          <p class="text-sm text-toned">
            {{ stat.label }}
          </p>
          <p class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">
            {{ stat.value }}
          </p>
        </UCard>
      </div>
      <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <UCard :ui="{ body: 'p-0', header: 'px-4 py-3' }">
          <template #header>
            <h2 class="text-sm font-semibold">
              {{ report.period === 'year' ? 'Détail par mois' : 'Détail par jour' }}
            </h2>
          </template>
          <div
            class="max-h-[32rem] overflow-auto"
            role="region"
            aria-label="Ventes facturées par période"
            tabindex="0"
          >
            <table class="commercial-table">
              <thead>
                <tr>
                  <th scope="col">
                    {{ report.period === 'year' ? 'Mois' : 'Jour' }}
                  </th><th scope="col">
                    Factures
                  </th><th scope="col">
                    Facturé TTC
                  </th><th scope="col">
                    Réductions
                  </th><th scope="col">
                    Net TTC
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="bucket in report.buckets" :key="bucket.date">
                  <th scope="row">
                    {{ bucketLabel(bucket.date) }}
                  </th>
                  <td>{{ bucket.invoiceCount }}</td><td>{{ formatCurrency(bucket.invoicedTotal) }}</td><td>{{ formatCurrency(bucket.creditTotal) }}</td>
                  <td :class="bucket.total < 0 ? 'text-error' : 'text-highlighted'" class="font-semibold">
                    {{ formatCurrency(bucket.total) }}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">
                    Total
                  </th><td>{{ report.totals.invoiceCount }}</td><td>{{ formatCurrency(report.totals.invoicedTotal) }}</td><td>{{ formatCurrency(report.totals.creditTotal) }}</td><td>{{ formatCurrency(report.totals.total) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </UCard>
        <UCard :ui="{ body: 'p-0', header: 'px-4 py-3' }">
          <template #header>
            <h2 class="text-sm font-semibold">
              Ventes par catégorie de ligne
            </h2>
          </template>
          <div
            v-if="report.categories.length"
            class="overflow-x-auto"
            role="region"
            aria-label="Ventes facturées par catégorie"
            tabindex="0"
          >
            <table class="commercial-table">
              <thead>
                <tr>
                  <th scope="col">
                    Catégorie
                  </th><th scope="col">
                    Facturé TTC
                  </th><th scope="col">
                    Réductions
                  </th><th scope="col">
                    Net TTC
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="category in report.categories" :key="category.category || 'uncategorized'">
                  <th scope="row">
                    {{ category.category ? lineCategoryLabels[category.category] : 'Sans catégorie' }}
                  </th>
                  <td>{{ formatCurrency(category.invoicedTotal) }}</td><td>{{ formatCurrency(category.creditTotal) }}</td>
                  <td :class="category.total < 0 ? 'text-error' : 'text-highlighted'" class="font-semibold">
                    {{ formatCurrency(category.total) }}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">
                    Total
                  </th><td>{{ formatCurrency(report.totals.invoicedTotal) }}</td><td>{{ formatCurrency(report.totals.creditTotal) }}</td><td>{{ formatCurrency(report.totals.total) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p v-else class="p-4 text-sm text-toned">
            Aucune facture émise ni réduction commerciale sur cette période.
          </p>
        </UCard>
      </div>
      <p class="text-xs text-muted">
        Dates en heure suisse. Les réductions globales sont réparties entre les lignes au prorata de leur montant TTC. Une correction de facture met à jour sa période d’émission ; les périodes ne sont pas clôturées.
      </p>
    </template>
  </div>
</template>

<style scoped>
.commercial-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
.commercial-table th, .commercial-table td { padding: 0.625rem 0.75rem; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--ui-border-muted); }
.commercial-table th:first-child { text-align: left; }
.commercial-table tbody th { font-weight: 400; }
.commercial-table thead th { position: sticky; top: 0; z-index: 1; background: var(--ui-bg); font-weight: 500; color: var(--ui-text-toned); }
.commercial-table tfoot th, .commercial-table tfoot td { position: sticky; bottom: 0; background: var(--ui-bg); border-top: 1px solid var(--ui-border); font-weight: 600; }
</style>
