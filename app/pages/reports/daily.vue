<script setup lang="ts">
import DailyBreakdownCharts from '~/components/reports/DailyBreakdownCharts.client.vue'
import { lineCategoryLabels } from '~~/shared/constants/pos'
import type { DailySummary } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime, getPaymentMethodLabel, toDateInputValue } from '~~/shared/utils/pos'

const date = ref(toDateInputValue())

const { data: summary, refresh } = await useFetch<DailySummary>('/api/reports/end-of-day', {
  query: computed(() => ({
    date: date.value
  }))
})

const paymentTransactionCount = computed(() => {
  return summary.value?.totalsByMethod.reduce((count, item) => count + item.transactionCount, 0) || 0
})

const unpaidDocumentsTotal = computed(() => {
  return summary.value?.unpaidDocuments.reduce((total, document) => total + document.balanceDue, 0) || 0
})

const turnoverTotal = computed(() => {
  return summary.value?.turnoverByCategory.reduce((total, item) => total + item.total, 0) || 0
})

watch(date, async () => {
  await refresh()
})

function formatPaymentCount(count: number) {
  return `${count} paiement${count > 1 ? 's' : ''}`
}

function getShortPaymentMethodLabel(method: DailySummary['totalsByMethod'][number]['method']) {
  switch (method) {
    case 'cash':
      return 'Espèces'
    case 'card_twint':
      return 'Carte / TWINT'
    case 'bank_transfer':
      return 'Virement'
    case 'stripe':
      return 'Stripe'
  }
}

function printReport() {
  if (typeof window === 'undefined') {
    return
  }

  window.print()
}
</script>

<template>
  <UDashboardPanel id="report-daily">
    <template #header>
      <UDashboardNavbar title="Fin de journée" class="print:hidden">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            label="Imprimer"
            icon="i-lucide-printer"
            color="neutral"
            variant="ghost"
            @click="printReport"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="print:hidden">
        <UInput v-model="date" type="date" class="w-52" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="summary" class="daily-report mx-auto w-full max-w-[104rem] space-y-4">
        <header class="hidden print:block">
          <div class="flex items-end justify-between border-b border-black pb-2">
            <div>
              <h1 class="text-xl font-semibold text-black">
                Fin de journée
              </h1>
              <p class="text-xs text-black/70">
                Rapport du {{ summary.date }}
              </p>
            </div>
            <div class="text-right text-xs text-black/70">
              <p>{{ formatPaymentCount(paymentTransactionCount) }}</p>
              <p>{{ summary.paidDocuments.length }} facture(s) encaissée(s)</p>
            </div>
          </div>
        </header>

        <section class="report-panel report-summary">
          <div class="report-summary-grid">
            <div class="report-total report-metric report-metric-main">
              <p class="report-kicker">
                Total encaissé
              </p>
              <p class="report-total-value">
                {{ formatCurrency(summary.totalPaid) }}
              </p>
              <p class="mt-2 text-sm text-toned">
                {{ formatPaymentCount(paymentTransactionCount) }} · {{ summary.totalsByMethod.length }} méthode(s)
              </p>
            </div>

            <div class="report-metric">
              <p class="report-kicker">
                Factures non réglées
              </p>
              <p class="report-stat-value">
                {{ summary.unpaidDocuments.length }} · {{ formatCurrency(unpaidDocumentsTotal) }}
              </p>
            </div>

            <div class="report-metric">
              <p class="report-kicker">
                Tickets
              </p>
              <p class="report-stat-value">
                {{ summary.ticketStats.openCount }} ouverts · {{ summary.ticketStats.openedToday }} créés · {{ summary.ticketStats.closedToday }} clos
              </p>
            </div>

            <div class="report-metric">
              <p class="report-kicker">
                Date
              </p>
              <p class="report-stat-value">
                {{ summary.date }}
              </p>
            </div>
          </div>

          <div class="report-methods">
            <div
              v-for="item in summary.totalsByMethod"
              :key="item.method"
              class="report-method-row"
            >
              <span class="report-method-name">
                {{ getShortPaymentMethodLabel(item.method) }}
              </span>

              <div class="report-method-detail">
                <span class="report-method-amount">
                  {{ formatCurrency(item.total) }}
                </span>

                <span class="report-method-count" :title="getPaymentMethodLabel(item.method)">
                  {{ formatPaymentCount(item.transactionCount) }}
                </span>
              </div>
            </div>

            <div v-if="!summary.totalsByMethod.length" class="report-empty">
              Aucun paiement enregistré.
            </div>
          </div>
        </section>

        <section class="report-panel report-critical">
          <div class="report-section-header">
            <div>
              <h2>Factures du jour non réglées</h2>
              <p>{{ summary.unpaidDocuments.length }} document(s), {{ formatCurrency(unpaidDocumentsTotal) }} restant à payer</p>
            </div>
          </div>

          <div class="report-table-wrap">
            <table class="report-table report-table-compact">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Nom</th>
                  <th class="amount">
                    Total
                  </th>
                  <th class="amount">
                    Total réglé
                  </th>
                  <th class="amount">
                    Reste à payer
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="document in summary.unpaidDocuments"
                  :key="document.id"
                >
                  <td>
                    <NuxtLink :to="`/documents/${document.id}`">
                      {{ document.documentNumber }}
                    </NuxtLink>
                  </td>
                  <td>{{ document.customerName }}</td>
                  <td class="amount">
                    {{ formatCurrency(document.total) }}
                  </td>
                  <td class="amount">
                    {{ formatCurrency(document.paidAmount) }}
                  </td>
                  <td class="amount strong">
                    {{ formatCurrency(document.balanceDue) }}
                  </td>
                </tr>
                <tr v-if="!summary.unpaidDocuments.length">
                  <td colspan="5" class="empty-cell">
                    Aucune facture du jour non réglée.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
          <section class="report-panel">
            <div class="report-section-header">
              <div>
                <h2>Factures encaissées</h2>
                <p>{{ summary.paidDocuments.length }} document(s), {{ formatCurrency(summary.totalPaid) }} encaissé(s)</p>
              </div>
            </div>

            <div class="report-table-wrap">
              <table class="report-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Client</th>
                    <th class="amount">
                      Encaissé jour
                    </th>
                    <th class="amount">
                      Total TTC
                    </th>
                    <th>Dernier paiement</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="document in summary.paidDocuments"
                    :key="document.id"
                  >
                    <td>
                      <NuxtLink :to="`/documents/${document.id}`">
                        {{ document.documentNumber }}
                      </NuxtLink>
                    </td>
                    <td>{{ document.customerName }}</td>
                    <td class="amount strong">
                      {{ formatCurrency(document.paidAmountToday) }}
                    </td>
                    <td class="amount">
                      {{ formatCurrency(document.total) }}
                    </td>
                    <td>{{ formatDateTime(document.paidAt) }}</td>
                  </tr>
                  <tr v-if="!summary.paidDocuments.length">
                    <td colspan="5" class="empty-cell">
                      Aucun document encaissé à la date sélectionnée.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="report-panel">
            <div class="report-section-header">
              <div>
                <h2>Répartition</h2>
                <p>{{ formatCurrency(turnoverTotal) }} de chiffre d’affaires catégorisé</p>
              </div>
            </div>

            <DailyBreakdownCharts class="print:hidden" kind="turnover" :summary="summary" />

            <div class="report-table-wrap">
              <table class="report-table report-table-compact">
                <thead>
                  <tr>
                    <th>Catégorie</th>
                    <th class="amount">
                      Chiffre d’affaires
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in summary.turnoverByCategory"
                    :key="item.category"
                  >
                    <td>{{ lineCategoryLabels[item.category] }}</td>
                    <td class="amount strong">
                      {{ formatCurrency(item.total) }}
                    </td>
                  </tr>
                  <tr v-if="!summary.turnoverByCategory.length">
                    <td colspan="2" class="empty-cell">
                      Aucune répartition disponible.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.report-panel {
  border: 1px solid var(--ui-border);
  border-radius: 0.875rem;
  background: color-mix(in oklab, var(--ui-bg) 92%, var(--ui-bg-muted));
  padding: 0.875rem;
  box-shadow: 0 1px 2px color-mix(in oklab, var(--ui-text) 8%, transparent);
}

.report-summary {
  display: grid;
  gap: 0.625rem;
  background: color-mix(in oklab, var(--ui-primary) 3%, var(--ui-bg));
}

.report-summary-grid {
  display: grid;
  grid-template-columns: minmax(18rem, 1.2fr) repeat(3, minmax(10rem, 0.75fr));
  gap: 0;
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, var(--ui-border));
  border-radius: 0.75rem;
  background: color-mix(in oklab, var(--ui-bg) 92%, transparent);
}

.report-metric {
  min-height: 5.25rem;
  min-width: 0;
  padding: 0.875rem 1rem;
  border-left: 1px solid color-mix(in oklab, var(--ui-primary) 18%, var(--ui-border-muted));
  background: color-mix(in oklab, var(--ui-bg) 94%, transparent);
}

.report-metric-main {
  border-left: 0;
  background: color-mix(in oklab, var(--ui-primary) 7%, var(--ui-bg));
}

.report-kicker {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-toned);
}

.report-total-value {
  margin-top: 0.375rem;
  font-size: clamp(2.125rem, 3.1vw, 3.25rem);
  font-weight: 700;
  line-height: 1;
  color: var(--ui-text-highlighted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.report-methods {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.report-method-row {
  border: 1px solid var(--ui-border-muted);
  border-radius: 0.625rem;
  background: color-mix(in oklab, var(--ui-bg) 82%, transparent);
  padding: 0.55rem 0.7rem;
  min-width: 0;
}

.report-method-name {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: var(--ui-text);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.report-method-name::before {
  content: '';
  width: 0.5rem;
  height: 0.5rem;
  flex: 0 0 auto;
  margin-right: 0.5rem;
  border-radius: 999px;
  background: var(--ui-primary);
}

.report-method-detail {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.625rem;
  margin-top: 0.35rem;
}

.report-method-amount {
  color: var(--ui-text-highlighted);
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.report-method-count {
  color: var(--ui-text-toned);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.report-stat-value {
  margin-top: 0.125rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

@media (max-width: 1120px) {
  .report-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .report-metric:nth-child(odd) {
    border-left: 0;
  }

  .report-methods {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .report-summary-grid,
  .report-methods {
    grid-template-columns: 1fr;
  }

  .report-metric {
    border-left: 0;
    border-top: 1px solid color-mix(in oklab, var(--ui-primary) 18%, var(--ui-border-muted));
  }

  .report-metric-main {
    border-top: 0;
  }
}

.report-critical {
  border-color: color-mix(in oklab, var(--ui-warning) 42%, var(--ui-border));
  background: color-mix(in oklab, var(--ui-warning) 6%, var(--ui-bg));
}

.report-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.report-section-header h2 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--ui-text-highlighted);
}

.report-section-header p {
  margin-top: 0.125rem;
  font-size: 0.8125rem;
  color: var(--ui-text-toned);
}

.report-table-wrap {
  overflow-x: auto;
}

.report-table {
  width: 100%;
  min-width: 44rem;
  border-collapse: collapse;
  font-size: 0.8125rem;
  line-height: 1.25;
}

.report-table-compact {
  min-width: 38rem;
  font-size: 0.78125rem;
}

.report-table th {
  border-bottom: 1px solid var(--ui-border);
  padding: 0.5rem 0.625rem;
  color: var(--ui-text-toned);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}

.report-table td {
  border-bottom: 1px solid var(--ui-border-muted);
  padding: 0.5rem 0.625rem;
  color: var(--ui-text);
  vertical-align: top;
}

.report-table a {
  color: var(--ui-text-highlighted);
  font-weight: 700;
  text-decoration: none;
}

.report-table .amount {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.report-table .strong {
  color: var(--ui-text-highlighted);
  font-weight: 700;
}

.empty-cell {
  color: var(--ui-text-toned) !important;
  text-align: center;
}

@media print {
  @page {
    size: A4;
    margin: 8mm;
  }

  :global(body) {
    background: #fff !important;
  }

  :global(body:has(#report-daily) aside),
  :global(body:has(#report-daily) #default) {
    display: none !important;
  }

  #report-daily {
    color: #111 !important;
  }

  .daily-report {
    max-width: none !important;
    padding: 0 !important;
    gap: 6px !important;
  }

  .report-panel {
    break-inside: avoid;
    border-color: #111 !important;
    border-radius: 0 !important;
    background: #fff !important;
    box-shadow: none !important;
    padding: 6px 8px !important;
  }

  .report-summary {
    margin-top: 6px;
  }

  .daily-report > div {
    display: block !important;
  }

  .report-summary-grid {
    display: grid !important;
    grid-template-columns: 1.4fr repeat(3, 1fr) !important;
    gap: 4px !important;
  }

  .report-metric {
    border: 0 !important;
    border-radius: 0 !important;
    background: #fff !important;
    padding: 0 !important;
  }

  .report-total-value {
    margin-top: 1px !important;
    font-size: 22px !important;
    color: #000 !important;
  }

  .report-methods {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px 12px !important;
    margin-top: 4px !important;
  }

  .report-method-row {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) max-content;
    border: 0 !important;
    border-radius: 0 !important;
    background: #fff !important;
    padding: 1px 0 !important;
  }

  .report-method-name::before {
    display: none !important;
  }

  .report-method-detail {
    margin-top: 0 !important;
  }

  .report-section-header {
    margin-bottom: 3px !important;
  }

  .report-section-header h2 {
    color: #000 !important;
    font-size: 12px !important;
  }

  .report-section-header p,
  .report-kicker,
  .report-stat-value,
  .report-table th,
  .report-table td {
    color: #111 !important;
  }

  .report-table-wrap {
    overflow: visible !important;
  }

  .report-table,
  .report-table-compact {
    min-width: 0 !important;
    font-size: 9px !important;
    line-height: 1.12 !important;
  }

  .report-table th,
  .report-table td {
    border-color: #999 !important;
    padding: 2px 4px !important;
  }

  .report-table a {
    color: #000 !important;
  }
}
</style>
