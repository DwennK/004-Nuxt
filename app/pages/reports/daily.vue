<script setup lang="ts">
import DailyReportPrint from '~/components/reports/DailyReportPrint.vue'
import { lineCategoryLabels } from '~~/shared/constants/pos'
import type { DailySummary } from '~~/shared/types/pos'
import { businessTimeZone, formatCurrency, formatDateTime, getPaymentMethodLabel, toDateInputValue } from '~~/shared/utils/pos'

const date = ref(toDateInputValue())
const { data: summary, status, error, refresh } = await useFetch<DailySummary>('/api/reports/end-of-day', {
  query: computed(() => ({ date: date.value }))
})

const reportReady = computed(() => !!summary.value && status.value === 'success')
const paymentCount = computed(() => summary.value?.totalsByMethod.reduce((sum, item) => sum + item.transactionCount, 0) || 0)
const paidSubtotal = computed(() => summary.value?.paidDocuments.reduce((sum, document) => sum + document.paidAmountToday, 0) || 0)
const categories = computed(() => [...(summary.value?.turnoverByCategory || [])].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category)))
const categoryTotal = computed(() => categories.value.reduce((sum, item) => sum + item.total, 0))
const unpaidDocuments = computed(() => [...(summary.value?.unpaidDocuments || [])].sort((a, b) => b.balanceDue - a.balanceDue || a.documentNumber.localeCompare(b.documentNumber, 'fr-CH', { numeric: true })))
const unpaidTotal = computed(() => unpaidDocuments.value.reduce((sum, document) => sum + document.balanceDue, 0))

function amount(cents: number) {
  return formatCurrency(cents).replace(/\sCHF$/, '')
}

function paymentTime(value: string) {
  return new Intl.DateTimeFormat('fr-CH', {
    hour: '2-digit', minute: '2-digit', timeZone: businessTimeZone
  }).format(new Date(value))
}

function printReport() {
  if (reportReady.value && typeof window !== 'undefined') window.print()
}
</script>

<template>
  <UDashboardPanel id="report-daily" class="daily-report-panel">
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
            variant="outline"
            :disabled="!reportReady"
            @click="printReport"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar class="print:hidden">
        <div class="flex items-center gap-3">
          <label for="report-date" class="text-sm font-medium text-toned">Journée</label>
          <UInput
            id="report-date"
            v-model="date"
            type="date"
            class="w-44"
          />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="status === 'pending'" role="status" class="flex items-center gap-2 py-6 text-sm text-toned print:hidden">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Chargement du rapport…
      </div>
      <UAlert
        v-else-if="error"
        title="Le rapport n’a pas pu être chargé."
        description="Réessayez pour afficher les chiffres de cette journée."
        icon="i-lucide-circle-alert"
        color="error"
        variant="subtle"
        class="print:hidden"
        :actions="[{ label: 'Réessayer', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
      />
      <template v-else-if="summary && reportReady">
        <DailyReportPrint :summary="summary" />
        <div class="daily-report print:hidden">
          <section class="report-overview" aria-label="Encaissements de la journée">
            <div class="report-total">
              <p class="report-kicker">
                Total encaissé
              </p>
              <p class="report-total-value">
                {{ formatCurrency(summary.totalPaid) }}
              </p>
              <p class="text-sm text-toned">
                {{ paymentCount }} paiement{{ paymentCount > 1 ? 's' : '' }}
              </p>
            </div>
            <div class="report-methods">
              <h2>Moyens de paiement</h2>
              <table v-if="summary.totalsByMethod.length" class="report-table methods-table">
                <thead>
                  <tr>
                    <th scope="col">
                      Moyen
                    </th>
                    <th scope="col" class="amount">
                      Paiements
                    </th>
                    <th scope="col" class="amount">
                      Montant CHF
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in summary.totalsByMethod" :key="item.method">
                    <th scope="row">
                      {{ getPaymentMethodLabel(item.method) }}
                    </th>
                    <td class="amount text-toned">
                      {{ item.transactionCount }}
                    </td>
                    <td class="amount strong">
                      {{ amount(item.total) }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="report-empty">
                Aucun paiement enregistré.
              </p>
            </div>
          </section>

          <section class="report-section" aria-labelledby="paid-title">
            <div class="report-section-heading">
              <h2 id="paid-title">
                Factures réglées avec encaissement ce jour
              </h2>
              <UBadge
                :label="String(summary.paidDocuments.length)"
                color="neutral"
                variant="soft"
                size="sm"
              />
            </div>
            <div
              v-if="summary.paidDocuments.length"
              class="report-table-wrap"
              role="region"
              aria-label="Factures réglées"
              tabindex="0"
            >
              <table class="report-table documents-table">
                <thead>
                  <tr>
                    <th scope="col">
                      Facture
                    </th>
                    <th scope="col" class="customer-cell">
                      Client
                    </th>
                    <th scope="col">
                      Dernier paiement
                    </th>
                    <th scope="col" class="amount">
                      Total TTC CHF
                    </th>
                    <th scope="col" class="amount">
                      Encaissé ce jour CHF
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="document in summary.paidDocuments" :key="document.id">
                    <th scope="row">
                      <NuxtLink :to="`/documents/${document.id}`">{{ document.documentNumber }}</NuxtLink>
                    </th>
                    <td class="customer-cell">
                      {{ document.customerName }}
                    </td>
                    <td class="text-toned" :title="formatDateTime(document.paidAt)">
                      {{ paymentTime(document.paidAt) }}
                    </td>
                    <td class="amount">
                      {{ amount(document.total) }}
                    </td>
                    <td class="amount strong">
                      {{ amount(document.paidAmountToday) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="summary.paidDocuments.length" class="report-subtotal">
              <span>Sous-total encaissé sur ces factures</span>
              <strong>{{ formatCurrency(paidSubtotal) }}</strong>
            </div>
            <p v-else class="report-empty">
              Aucune facture entièrement réglée avec encaissement ce jour.
            </p>
          </section>

          <section class="report-section" aria-labelledby="category-title">
            <div class="report-section-heading">
              <h2 id="category-title">
                Répartition par catégorie
              </h2>
            </div>
            <p class="report-note">
              Lignes catégorisées des factures ci-dessus
            </p>
            <table v-if="categories.length" class="report-table">
              <thead>
                <tr>
                  <th scope="col">
                    Catégorie
                  </th>
                  <th scope="col" class="amount">
                    Montant TTC CHF
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in categories" :key="item.category">
                  <th scope="row">
                    {{ lineCategoryLabels[item.category] }}
                  </th>
                  <td class="amount">
                    {{ amount(item.total) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="categories.length" class="report-subtotal">
              <span>Total catégorisé</span>
              <strong>{{ formatCurrency(categoryTotal) }}</strong>
            </div>
            <p v-else class="report-empty">
              Aucune répartition disponible.
            </p>
          </section>

          <section class="report-section report-unpaid" aria-labelledby="unpaid-title">
            <template v-if="unpaidDocuments.length">
              <div class="report-section-heading">
                <h2 id="unpaid-title">
                  Factures du jour non réglées
                </h2>
                <UBadge
                  :label="String(unpaidDocuments.length)"
                  color="warning"
                  variant="subtle"
                  size="sm"
                />
              </div>
              <div
                class="report-table-wrap"
                role="region"
                aria-label="Factures du jour non réglées"
                tabindex="0"
              >
                <table class="report-table documents-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        Facture
                      </th>
                      <th scope="col" class="customer-cell">
                        Client
                      </th>
                      <th scope="col" class="amount">
                        Total TTC CHF
                      </th>
                      <th scope="col" class="amount">
                        Déjà réglé CHF
                      </th>
                      <th scope="col" class="amount">
                        Solde dû CHF
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="document in unpaidDocuments" :key="document.id">
                      <th scope="row">
                        <NuxtLink :to="`/documents/${document.id}`">{{ document.documentNumber }}</NuxtLink>
                      </th>
                      <td class="customer-cell">
                        {{ document.customerName }}
                      </td>
                      <td class="amount">
                        {{ amount(document.total) }}
                      </td>
                      <td class="amount">
                        {{ amount(document.paidAmount) }}
                      </td>
                      <td class="amount strong">
                        {{ amount(document.balanceDue) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="report-subtotal">
                <span>Total restant dû</span>
                <strong>{{ formatCurrency(unpaidTotal) }}</strong>
              </div>
            </template>
            <p v-else id="unpaid-title" class="flex items-center gap-2 text-sm text-toned">
              <UIcon name="i-lucide-circle-check" class="size-4 shrink-0 text-success" />
              Aucune facture du jour non réglée.
            </p>
          </section>
        </div>
      </template>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.daily-report {
  width: 100%;
  max-width: 96rem;
  margin: 0 auto;
  padding: 1.25rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.report-overview {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  align-items: center;
  gap: 2rem;
}

.report-total {
  display: grid;
  gap: 0.375rem;
}

.report-kicker {
  color: var(--ui-text-toned);
  font-size: 0.75rem;
  font-weight: 600;
}

.report-total-value {
  color: var(--ui-text-highlighted);
  font-size: clamp(1.875rem, 3vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.report-methods {
  min-width: 0;
  padding-left: 1.5rem;
  border-left: 1px solid var(--ui-border);
}

.daily-report h2 {
  color: var(--ui-text-highlighted);
  font-size: 0.9375rem;
  font-weight: 650;
  line-height: 1.4;
}

.report-section {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--ui-border);
}

.report-section-heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.report-note,
.report-empty {
  color: var(--ui-text-toned);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.report-note { margin: -0.25rem 0 0.5rem; }
.report-empty { padding: 0.25rem 0; }

.report-table-wrap {
  max-height: 22rem;
  overflow: auto;
}

.report-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}

.documents-table { min-width: 44rem; }

.report-table th,
.report-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--ui-border-muted);
  text-align: left;
  vertical-align: top;
}

.report-table th:first-child,
.report-table td:first-child { padding-left: 0; }
.report-table th:last-child,
.report-table td:last-child { padding-right: 0; }
.report-table th { font-weight: 400; }

.report-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--ui-bg);
  color: var(--ui-text-toned);
  border-bottom-color: var(--ui-border);
  font-size: 0.6875rem;
  font-weight: 600;
  white-space: nowrap;
}

.report-table tbody tr:last-child > * { border-bottom: 0; }
.documents-table tbody tr:hover > * { background: var(--ui-bg-muted); }
.report-table .customer-cell { width: 40%; min-width: 12rem; overflow-wrap: anywhere; }
.report-table .amount { text-align: right; white-space: nowrap; }
.report-table .strong { font-weight: 600; color: var(--ui-text-highlighted); }
.report-table a { color: var(--ui-primary); font-weight: 600; white-space: nowrap; }
.report-table a:hover { text-decoration: underline; }
.report-table a:focus-visible,
.report-table-wrap:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }

.report-subtotal {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ui-border);
  font-size: 0.8125rem;
}

.report-subtotal strong { color: var(--ui-text-highlighted); white-space: nowrap; font-variant-numeric: tabular-nums; }

@media (max-width: 767px) {
  .daily-report { padding: 1rem; }
  .report-overview { grid-template-columns: 1fr; gap: 1rem; }
  .report-methods { padding: 1rem 0 0; border-left: 0; border-top: 1px solid var(--ui-border-muted); }
  .report-table th,
  .report-table td { padding-right: 0.375rem; padding-left: 0.375rem; }
  .report-section { margin-top: 1rem; padding-top: 1rem; }
}

@media print {
  @page daily-report {
    size: A4 portrait;
    margin: 14mm;
  }

  :global(body:has(.daily-report-print)) {
    page: daily-report;
    margin: 0 !important;
    background: #fff !important;
  }

  /* Release the dashboard's fixed viewport and scroll containers for pagination. */
  :global(body:has(.daily-report-print) #__nuxt),
  :global(body:has(.daily-report-print) #__nuxt div:has(.daily-report-print)) {
    display: block !important;
    position: static !important;
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
    margin: 0 !important;
    border: 0 !important;
    background: #fff !important;
  }

  :global(body:has(.daily-report-print) div:has(> .daily-report-panel) > :not(.daily-report-panel)),
  :global(body:has(.daily-report-print) nuxt-devtools-frame) {
    display: none !important;
  }
}
</style>
