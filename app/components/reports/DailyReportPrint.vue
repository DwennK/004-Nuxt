<script setup lang="ts">
import { lineCategoryLabels } from '~~/shared/constants/pos'
import type { DailySummary } from '~~/shared/types/pos'
import { businessTimeZone, formatCurrency, getPaymentMethodLabel } from '~~/shared/utils/pos'

const props = defineProps<{ summary: DailySummary }>()

const reportDate = computed(() => new Intl.DateTimeFormat('fr-CH', {
  dateStyle: 'full',
  timeZone: businessTimeZone
}).format(new Date(`${props.summary.date}T12:00:00Z`)).replace(',', ''))

const paymentCount = computed(() => props.summary.totalsByMethod.reduce((sum, item) => sum + item.transactionCount, 0))
const paidSubtotal = computed(() => props.summary.paidDocuments.reduce((sum, document) => sum + document.paidAmountToday, 0))
const categories = computed(() => [...props.summary.turnoverByCategory].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category)))
const categoryTotal = computed(() => categories.value.reduce((sum, item) => sum + item.total, 0))
const unpaidDocuments = computed(() => [...props.summary.unpaidDocuments].sort((a, b) => b.balanceDue - a.balanceDue || a.documentNumber.localeCompare(b.documentNumber, 'fr-CH', { numeric: true })))
const unpaidTotal = computed(() => unpaidDocuments.value.reduce((sum, document) => sum + document.balanceDue, 0))

function amount(cents: number) {
  return formatCurrency(cents).replace(/\sCHF$/, '')
}

function paymentTime(value: string) {
  return new Intl.DateTimeFormat('fr-CH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: businessTimeZone
  }).format(new Date(value))
}
</script>

<template>
  <article class="daily-report-print" aria-label="Rapport financier à imprimer">
    <header class="print-heading">
      <h1>Rapport de fin de journée</h1>
      <p class="print-date">
        {{ reportDate }}
      </p>
      <div class="print-total">
        <p>Total encaissé · {{ paymentCount }} paiement{{ paymentCount > 1 ? 's' : '' }}</p>
        <p class="print-total-value">
          {{ formatCurrency(summary.totalPaid) }}
        </p>
      </div>
    </header>

    <section>
      <h2>Encaissements par moyen de paiement</h2>
      <table v-if="summary.totalsByMethod.length">
        <thead>
          <tr>
            <th scope="col">
              Moyen de paiement
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
            <td class="amount">
              {{ item.transactionCount }}
            </td>
            <td class="amount">
              {{ amount(item.total) }}
            </td>
          </tr>
          <tr class="subtotal">
            <th scope="row">
              Total encaissé
            </th>
            <td class="amount">
              {{ paymentCount }}
            </td>
            <td class="amount">
              {{ amount(summary.totalPaid) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">
        Aucun paiement enregistré.
      </p>
    </section>

    <section>
      <h2>Factures réglées avec encaissement ce jour</h2>
      <table v-if="summary.paidDocuments.length" class="documents-table">
        <colgroup>
          <col class="number-column">
          <col class="customer-column">
          <col class="time-column">
          <col class="total-column">
          <col class="paid-column">
        </colgroup>
        <thead>
          <tr>
            <th scope="col">
              Facture
            </th>
            <th scope="col">
              Client
            </th>
            <th scope="col">
              Dernier paiement
            </th>
            <th scope="col" class="amount">
              Total TTC<br>CHF
            </th>
            <th scope="col" class="amount">
              Encaissé ce jour<br>CHF
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="document in summary.paidDocuments" :key="document.id">
            <th scope="row">
              {{ document.documentNumber }}
            </th>
            <td>{{ document.customerName }}</td>
            <td>{{ paymentTime(document.paidAt) }}</td>
            <td class="amount">
              {{ amount(document.total) }}
            </td>
            <td class="amount emphasis">
              {{ amount(document.paidAmountToday) }}
            </td>
          </tr>
          <tr class="subtotal">
            <th scope="row" colspan="4">
              Sous-total encaissé sur ces factures
            </th>
            <td class="amount">
              {{ amount(paidSubtotal) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">
        Aucune facture entièrement réglée avec encaissement ce jour.
      </p>
    </section>

    <section>
      <h2>Répartition par catégorie</h2>
      <p class="section-note">
        Lignes catégorisées des factures ci-dessus
      </p>
      <table v-if="categories.length">
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
          <tr class="subtotal">
            <th scope="row">
              Total catégorisé
            </th>
            <td class="amount">
              {{ amount(categoryTotal) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">
        Aucune répartition disponible.
      </p>
    </section>

    <section class="unpaid-section">
      <template v-if="unpaidDocuments.length">
        <h2>Factures du jour non réglées</h2>
        <p class="section-note">
          {{ unpaidDocuments.length }} facture{{ unpaidDocuments.length > 1 ? 's' : '' }} ·
          <strong>{{ formatCurrency(unpaidTotal) }} restant dû</strong>
        </p>
        <table class="documents-table">
          <colgroup>
            <col class="number-column">
            <col class="customer-column">
            <col class="balance-column">
            <col class="balance-column">
            <col class="balance-column">
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                Facture
              </th>
              <th scope="col">
                Client
              </th>
              <th scope="col" class="amount">
                Total TTC<br>CHF
              </th>
              <th scope="col" class="amount">
                Déjà réglé<br>CHF
              </th>
              <th scope="col" class="amount">
                Solde dû<br>CHF
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="document in unpaidDocuments" :key="document.id">
              <th scope="row">
                {{ document.documentNumber }}
              </th>
              <td>{{ document.customerName }}</td>
              <td class="amount">
                {{ amount(document.total) }}
              </td>
              <td class="amount">
                {{ amount(document.paidAmount) }}
              </td>
              <td class="amount emphasis">
                {{ amount(document.balanceDue) }}
              </td>
            </tr>
            <tr class="subtotal">
              <th scope="row" colspan="4">
                Total restant dû
              </th>
              <td class="amount">
                {{ amount(unpaidTotal) }}
              </td>
            </tr>
          </tbody>
        </table>
      </template>
      <p v-else>
        Aucune facture du jour non réglée.
      </p>
    </section>
  </article>
</template>

<style scoped>
.daily-report-print {
  display: none;
}

@media print {
  .daily-report-print {
    display: block;
    color: #000;
    background: #fff;
    font-family: 'Public Sans', sans-serif;
    font-size: 10.5pt;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    color-scheme: light;
  }

  .print-heading {
    padding-bottom: 5mm;
    border-bottom: 0.5pt solid #000;
    break-inside: avoid;
  }

  h1 {
    font-size: 18pt;
    font-weight: 700;
    line-height: 1.2;
  }

  .print-date {
    margin-top: 2mm;
  }

  .print-total {
    margin-top: 6mm;
  }

  .print-total-value {
    margin-top: 1mm;
    font-size: 26pt;
    font-weight: 700;
    line-height: 1.15;
  }

  section {
    margin-top: 6mm;
  }

  h2 {
    margin-bottom: 2mm;
    font-size: 12pt;
    font-weight: 700;
    line-height: 1.3;
    break-after: avoid;
  }

  .section-note {
    margin-bottom: 2mm;
    break-after: avoid;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: inherit;
    line-height: 1.35;
  }

  .documents-table {
    table-layout: fixed;
  }

  .number-column { width: 14%; }
  .customer-column { width: 32%; }
  .time-column { width: 15%; }
  .total-column { width: 18%; }
  .paid-column { width: 21%; }
  .balance-column { width: 18%; }

  thead {
    display: table-header-group;
    break-after: avoid;
  }

  tr {
    break-inside: avoid;
  }

  th,
  td {
    padding: 2mm 1.5mm;
    border-bottom: 0.35pt solid #ccc;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }

  th:first-child,
  td:first-child { padding-left: 0; }
  th:last-child,
  td:last-child { padding-right: 0; }

  th {
    font-weight: 400;
  }

  thead th {
    border-bottom-color: #000;
    font-size: 9pt;
    font-weight: 600;
    vertical-align: bottom;
  }

  .amount {
    text-align: right;
    white-space: nowrap;
    overflow-wrap: normal;
  }

  .emphasis,
  .subtotal th,
  .subtotal td {
    font-weight: 700;
  }

  .subtotal {
    break-before: avoid;
  }

  .subtotal th,
  .subtotal td {
    border-top: 0.5pt solid #000;
    border-bottom: 0;
  }

  .unpaid-section {
    padding-top: 4mm;
    border-top: 0.5pt solid #000;
  }

  .empty {
    break-inside: avoid;
  }
}
</style>
