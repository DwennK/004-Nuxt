<script setup lang="ts">
import QRCode from 'qrcode'
import { documentStatusLabels, documentTypeLabels, paymentMethodLabels } from '~~/shared/constants/pos'
import type { DocumentDetail } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { buildSwissQrBill } from '~~/shared/utils/qr-bill'
import type { SwissQrAddress } from '~~/shared/utils/qr-bill'
import { isValidSwissQrBillAccount } from '~~/shared/utils/iban'
import { formatCurrency, formatDate, formatDateTime } from '~~/shared/utils/pos'

definePageMeta({
  layout: false
})

const route = useRoute()
const id = computed(() => Number(route.params.id))

const [{ data: document }, { data: company }] = await Promise.all([
  useFetch<DocumentDetail>(() => `/api/documents/${id.value}`),
  useFetch<CompanySettingsRecord>('/api/settings/company')
])

const documentTitle = computed(() => document.value ? documentTypeLabels[document.value.type] : 'Document')
const paidAmount = computed(() => document.value?.payments
  .filter(payment => payment.status === 'paid')
  .reduce((total, payment) => total + payment.amount, 0) || 0)
const balanceDue = computed(() => Math.max((document.value?.total || 0) - paidAmount.value, 0))

const paymentSummary = computed(() => {
  if (!document.value?.payments.length) {
    return null
  }

  const latestPaid = [...document.value.payments]
    .filter(payment => payment.status === 'paid')
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0]

  if (!latestPaid) {
    return null
  }

  return {
    label: paymentMethodLabels[latestPaid.method],
    reference: latestPaid.reference,
    paidAt: formatDateTime(latestPaid.paidAt)
  }
})

const companyAddress = computed(() => {
  if (!company.value) {
    return []
  }

  return [
    company.value.address,
    [company.value.postalCode, company.value.city].filter(Boolean).join(' ').trim() || null
  ].filter(Boolean)
})

const customerAddress = computed(() => {
  if (!document.value) {
    return []
  }

  return [
    document.value.customer.addressLine1,
    document.value.customer.addressLine2,
    [document.value.customer.postalCode, document.value.customer.city].filter(Boolean).join(' ').trim() || null
  ].filter(Boolean)
})

const qrBill = computed(() => {
  if (!document.value || !company.value) {
    return null
  }

  return buildSwissQrBill(document.value, company.value)
})

const qrBillNotice = computed(() => {
  if (!document.value || !company.value || document.value.type !== 'invoice') {
    return null
  }

  if (!company.value.iban) {
    return 'QR-facture indisponible: ajoutez un IBAN dans les paramètres société.'
  }

  if (!isValidSwissQrBillAccount(company.value.iban)) {
    return 'QR-facture indisponible: utilisez un IBAN CH ou LI valide dans les paramètres société.'
  }

  if (!company.value.address || !company.value.postalCode || !company.value.city) {
    return 'QR-facture indisponible: complétez l’adresse société pour générer le paiement QR.'
  }

  return null
})

const { data: qrCodeDataUrl } = await useAsyncData(
  () => `document-print-qr-${id.value}`,
  async () => {
    if (!qrBill.value) {
      return null
    }

    return QRCode.toDataURL(qrBill.value.payload, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 220
    })
  }
)

function printDocument() {
  window.print()
}

function formatQrStreet(address: SwissQrAddress) {
  return [address.street, address.buildingNumber].filter(Boolean).join(' ')
}

function formatQrLocation(address: SwissQrAddress) {
  return [address.postalCode, address.city].filter(Boolean).join(' ')
}
</script>

<template>
  <div class="print-preview min-h-screen bg-muted/20 text-default">
    <div class="print-toolbar border-b border-default bg-default/95 backdrop-blur print:hidden">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div>
          <p class="text-xs uppercase tracking-[0.24em] text-toned">
            Aperçu imprimable
          </p>
          <h1 class="text-lg font-semibold text-highlighted">
            {{ document?.documentNumber || 'Document commercial' }}
          </h1>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Retour"
            @click="navigateTo(`/documents/${id}`)"
          />
          <UButton
            icon="i-lucide-printer"
            label="Imprimer"
            @click="printDocument"
          />
        </div>
      </div>
    </div>

    <main class="mx-auto flex max-w-6xl justify-center px-3 py-4 sm:px-6 sm:py-6 print:max-w-none print:px-0 print:py-0">
      <article
        v-if="document && company"
        class="sheet w-full max-w-[210mm] bg-white text-slate-900 shadow-sm ring-1 ring-black/5 print:max-w-none print:shadow-none print:ring-0"
        :class="{ 'sheet--with-qr': !!qrBill }"
      >
        <header class="invoice-header">
          <div class="invoice-head">
            <div class="invoice-brand">
              <div
                v-if="company.logoDataUrl"
                class="invoice-logo"
              >
                <img :src="company.logoDataUrl" :alt="company.name" class="max-h-full max-w-full object-contain">
              </div>

              <div>
                <p class="invoice-kicker">
                  Document commercial
                </p>
                <h2 class="invoice-company">
                  {{ company.name }}
                </h2>
                <div class="invoice-company-meta">
                  <p v-for="line in companyAddress" :key="`company-${line}`">
                    {{ line }}
                  </p>
                  <p v-if="company.phone">
                    {{ company.phone }}
                  </p>
                  <p v-if="company.email">
                    {{ company.email }}
                  </p>
                  <p v-if="company.website">
                    {{ company.website }}
                  </p>
                </div>
              </div>
            </div>

            <div class="invoice-meta">
              <p class="invoice-type">
                {{ documentTitle }}
              </p>
              <p class="invoice-number">
                {{ document.documentNumber }}
              </p>
              <p>Émis le {{ formatDate(document.issuedAt) }}</p>
              <p v-if="document.ticket">
                Réf. ticket {{ document.ticket.ticketNumber }}
              </p>
              <p>
                Statut {{ documentStatusLabels[document.status] }}
              </p>
            </div>
          </div>

          <div class="invoice-party-row">
            <section class="invoice-party invoice-party--compact">
              <p class="invoice-label">
                Références
              </p>
              <p v-if="company.vatNumber">
                TVA / IDE {{ company.vatNumber }}
              </p>
              <p v-if="company.bankName">
                Banque {{ company.bankName }}
              </p>
              <p v-if="company.iban">
                IBAN {{ company.iban }}
              </p>
              <p v-if="paymentSummary">
                Dernier paiement {{ paymentSummary.label }}
              </p>
              <p v-if="paymentSummary">
                {{ paymentSummary.paidAt }}
              </p>
            </section>

            <section class="invoice-window-wrap">
              <p class="invoice-label invoice-window-label">
                Adresse destinataire
              </p>
              <div class="invoice-window">
                <p class="invoice-strong">
                  {{ document.customer.displayName }}
                </p>
                <p v-for="line in customerAddress" :key="`customer-${line}`">
                  {{ line }}
                </p>
                <template v-if="!customerAddress.length">
                  <p v-if="document.customer.phone">
                    {{ document.customer.phone }}
                  </p>
                  <p v-if="document.customer.email">
                    {{ document.customer.email }}
                  </p>
                </template>
              </div>
            </section>
          </div>
        </header>

        <section class="invoice-lines">
          <table class="invoice-table">
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Qté</th>
                <th>Prix TTC</th>
                <th>TVA</th>
                <th class="text-right">
                  Total TTC
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in document.lines" :key="line.id">
                <td class="invoice-desc">
                  {{ line.label }}
                </td>
                <td>{{ line.quantity }}</td>
                <td>{{ formatCurrency(line.unitPrice) }}</td>
                <td>{{ line.vatRate }}%</td>
                <td class="text-right">
                  {{ formatCurrency(line.lineTotal) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="invoice-summary">
          <div class="invoice-notes">
            <div v-if="document.notes" class="invoice-note-block">
              <p class="invoice-label">
                Notes
              </p>
              <p class="whitespace-pre-line">
                {{ document.notes }}
              </p>
            </div>

            <div v-if="company.paymentTerms" class="invoice-note-block">
              <p class="invoice-label">
                Conditions de paiement
              </p>
              <p class="whitespace-pre-line">
                {{ company.paymentTerms }}
              </p>
            </div>

            <div v-if="qrBillNotice" class="invoice-note-block">
              <p class="invoice-label">
                Paiement QR
              </p>
              <p>
                {{ qrBillNotice }}
              </p>
            </div>
          </div>

          <div class="invoice-totals">
            <div class="invoice-total-row">
              <span>Total HT</span>
              <strong>{{ formatCurrency(document.subtotal) }}</strong>
            </div>
            <div class="invoice-total-row">
              <span>TVA</span>
              <strong>{{ formatCurrency(document.taxAmount) }}</strong>
            </div>
            <div class="invoice-total-row invoice-total-row--grand">
              <span>Total TTC</span>
              <strong>{{ formatCurrency(document.total) }}</strong>
            </div>
            <div v-if="paidAmount > 0" class="invoice-total-row">
              <span>Encaissé</span>
              <strong>{{ formatCurrency(paidAmount) }}</strong>
            </div>
            <div v-if="paidAmount > 0" class="invoice-total-row">
              <span>Reste</span>
              <strong>{{ formatCurrency(balanceDue) }}</strong>
            </div>
          </div>
        </section>

        <section v-if="qrBill && qrCodeDataUrl" class="qr-bill">
          <div class="qr-bill-receipt">
            <p class="qr-bill-title">
              Récépissé
            </p>

            <div class="qr-bill-block">
              <p class="qr-bill-label">
                Compte / Payable à
              </p>
              <p>{{ company.iban }}</p>
              <p>{{ qrBill.creditor.name }}</p>
              <p>{{ formatQrStreet(qrBill.creditor) }}</p>
              <p>{{ formatQrLocation(qrBill.creditor) }}</p>
            </div>

            <div v-if="qrBill.debtor" class="qr-bill-block">
              <p class="qr-bill-label">
                Payable par
              </p>
              <p>{{ qrBill.debtor.name }}</p>
              <p>{{ formatQrStreet(qrBill.debtor) }}</p>
              <p>{{ formatQrLocation(qrBill.debtor) }}</p>
            </div>

            <div class="qr-bill-amount-row">
              <div>
                <p class="qr-bill-label">
                  Monnaie
                </p>
                <p>CHF</p>
              </div>
              <div>
                <p class="qr-bill-label">
                  Montant
                </p>
                <p>{{ qrBill.amount }}</p>
              </div>
            </div>
          </div>

          <div class="qr-bill-payment">
            <div class="qr-bill-payment-head">
              <p class="qr-bill-title">
                Section paiement
              </p>
              <div>
                <p class="qr-bill-label">
                  Compte / Payable à
                </p>
                <p>{{ company.iban }}</p>
                <p>{{ qrBill.creditor.name }}</p>
                <p>{{ formatQrStreet(qrBill.creditor) }}</p>
                <p>{{ formatQrLocation(qrBill.creditor) }}</p>
              </div>
            </div>

            <div class="qr-bill-payment-body">
              <div class="qr-bill-code-wrap">
                <img :src="qrCodeDataUrl" alt="QR-facture suisse" class="qr-bill-code">
                <div class="qr-bill-code-mark" aria-hidden="true">
                  <div class="qr-bill-code-mark-cross" />
                </div>
              </div>

              <div class="qr-bill-details">
                <div class="qr-bill-block">
                  <p class="qr-bill-label">
                    Référence
                  </p>
                  <p>{{ qrBill.displayReference }}</p>
                </div>

                <div class="qr-bill-block">
                  <p class="qr-bill-label">
                    Informations supplémentaires
                  </p>
                  <p>{{ qrBill.message }}</p>
                </div>

                <div v-if="qrBill.debtor" class="qr-bill-block">
                  <p class="qr-bill-label">
                    Payable par
                  </p>
                  <p>{{ qrBill.debtor.name }}</p>
                  <p>{{ formatQrStreet(qrBill.debtor) }}</p>
                  <p>{{ formatQrLocation(qrBill.debtor) }}</p>
                </div>

                <div class="qr-bill-amount-row">
                  <div>
                    <p class="qr-bill-label">
                      Monnaie
                    </p>
                    <p>CHF</p>
                  </div>
                  <div>
                    <p class="qr-bill-label">
                      Montant
                    </p>
                    <p>{{ qrBill.amount }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer v-else-if="company.footerNotes || company.phone || company.email || company.website" class="invoice-footer">
          <p v-if="company.footerNotes" class="invoice-footer-note">
            {{ company.footerNotes }}
          </p>
          <div class="invoice-footer-meta">
            <span v-if="company.phone">{{ company.phone }}</span>
            <span v-if="company.email">{{ company.email }}</span>
            <span v-if="company.website">{{ company.website }}</span>
          </div>
        </footer>
      </article>

      <div
        v-else
        class="flex min-h-[60vh] w-full max-w-3xl items-center justify-center rounded-3xl border border-dashed border-default bg-default px-6 text-center text-sm text-toned"
      >
        Impossible de charger l’aperçu imprimable.
      </div>
    </main>
  </div>
</template>

<style>
@page {
  size: A4;
  margin: 7mm;
}

body {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.sheet {
  min-height: calc(297mm - 14mm);
  font-size: 10.5px;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}

.invoice-header,
.invoice-lines,
.invoice-summary,
.invoice-footer,
.qr-bill {
  padding-inline: 5.8mm;
}

.invoice-header {
  padding-top: 4.8mm;
  padding-bottom: 3.2mm;
  border-bottom: 0.2mm solid #dbe4f0;
}

.invoice-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 49mm;
  gap: 6mm;
  align-items: start;
}

.invoice-brand {
  display: flex;
  gap: 3mm;
  align-items: start;
}

.invoice-logo {
  width: 11.5mm;
  height: 11.5mm;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0.2mm solid #d9e1ed;
  border-radius: 1.8mm;
  overflow: hidden;
  flex-shrink: 0;
}

.invoice-kicker,
.invoice-label,
.qr-bill-label {
  margin: 0 0 1mm;
  font-size: 7.3px;
  line-height: 1.2;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #607393;
}

.invoice-company {
  margin: 0 0 1.6mm;
  font-size: 16px;
  line-height: 1.05;
  font-weight: 700;
  color: #0f172a;
}

.invoice-company-meta,
.invoice-meta,
.invoice-party,
.invoice-notes,
.invoice-footer,
.qr-bill {
  color: #334155;
}

.invoice-company-meta p,
.invoice-meta p,
.invoice-party p,
.qr-bill p {
  margin: 0 0 0.65mm;
}

.invoice-type {
  margin: 0 0 0.8mm;
  color: var(--ui-color-primary-600, #0f9f6e);
  font-size: 8px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  font-weight: 600;
}

.invoice-number {
  margin: 0 0 1.2mm;
  font-size: 13px;
  line-height: 1.1;
  font-weight: 700;
  color: #0f172a;
}

.invoice-meta {
  text-align: right;
}

.invoice-party-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 100mm;
  gap: 6mm;
  margin-top: 15.8mm;
  align-items: start;
}

.invoice-party {
  min-height: 0;
}

.invoice-window-wrap {
  min-height: 0;
  justify-self: end;
  margin-right: 14.2mm;
}

.invoice-window-label {
  margin-bottom: 1.2mm;
  text-align: left;
}

.invoice-window {
  width: 100mm;
  min-height: 50mm;
  padding: 9mm 6mm 0 8mm;
  color: #334155;
  overflow: hidden;
}

.invoice-strong {
  font-weight: 700;
  color: #0f172a;
}

.invoice-lines {
  padding-top: 3mm;
  padding-bottom: 3mm;
}

.invoice-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.invoice-table thead {
  background: #18233b;
  color: #fff;
}

.invoice-table th,
.invoice-table td {
  padding: 1.7mm 2mm;
  border-bottom: 0.2mm solid #dbe4f0;
  vertical-align: top;
}

.invoice-table th {
  font-size: 7.3px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-align: left;
}

.invoice-table th:nth-child(1),
.invoice-table td:nth-child(1) {
  width: 50%;
}

.invoice-table th:nth-child(2),
.invoice-table td:nth-child(2) {
  width: 7%;
}

.invoice-table th:nth-child(3),
.invoice-table td:nth-child(3) {
  width: 15%;
}

.invoice-table th:nth-child(4),
.invoice-table td:nth-child(4) {
  width: 8%;
}

.invoice-table th:nth-child(5),
.invoice-table td:nth-child(5) {
  width: 20%;
}

.invoice-desc {
  font-weight: 600;
  color: #0f172a;
  overflow-wrap: anywhere;
}

.invoice-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 54mm;
  gap: 4mm;
  padding-top: 0;
  padding-bottom: 3mm;
  align-items: start;
}

.invoice-notes {
  font-size: 9.5px;
}

.invoice-note-block + .invoice-note-block {
  margin-top: 2.2mm;
}

.invoice-totals {
  padding: 2.2mm 2.6mm;
  border: 0.2mm solid #111827;
  background: #f8fafc;
  color: #0f172a;
  border-radius: 1.6mm;
}

.invoice-total-row {
  display: flex;
  justify-content: space-between;
  gap: 4mm;
  padding-block: 0.65mm;
}

.invoice-total-row--grand {
  margin-top: 0.6mm;
  padding-top: 1.4mm;
  border-top: 0.2mm solid #cbd5e1;
}

.qr-bill {
  display: grid;
  grid-template-columns: 62mm minmax(0, 1fr);
  min-height: 105mm;
  border-top: 0.2mm solid #111827;
}

.qr-bill-receipt,
.qr-bill-payment {
  padding-top: 3.2mm;
  padding-bottom: 3mm;
}

.qr-bill-receipt {
  padding-right: 3.2mm;
  border-right: 0.2mm solid #111827;
}

.qr-bill-payment {
  padding-left: 3.2mm;
}

.qr-bill-title {
  margin: 0 0 2.8mm;
  font-size: 8.4px;
  line-height: 1.1;
  font-weight: 700;
  color: #111827;
}

.qr-bill-block + .qr-bill-block {
  margin-top: 2.8mm;
}

.qr-bill-payment-head {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3mm;
  align-items: start;
}

.qr-bill-payment-body {
  display: grid;
  grid-template-columns: 46mm minmax(0, 1fr);
  gap: 4mm;
  margin-top: 2.8mm;
}

.qr-bill-code-wrap {
  position: relative;
  width: 46mm;
  height: 46mm;
}

.qr-bill-code {
  display: block;
  width: 46mm;
  height: 46mm;
}

.qr-bill-code-mark {
  position: absolute;
  inset: 50% auto auto 50%;
  width: 7mm;
  height: 7mm;
  transform: translate(-50%, -50%);
  background: #fff;
  border: 0.2mm solid #111827;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr-bill-code-mark-cross {
  position: relative;
  width: 4.4mm;
  height: 4.4mm;
  background: #111827;
}

.qr-bill-code-mark-cross::before,
.qr-bill-code-mark-cross::after {
  content: '';
  position: absolute;
  background: #fff;
}

.qr-bill-code-mark-cross::before {
  top: 1.7mm;
  left: 0.7mm;
  width: 3mm;
  height: 1mm;
}

.qr-bill-code-mark-cross::after {
  top: 0.7mm;
  left: 1.7mm;
  width: 1mm;
  height: 3mm;
}

.qr-bill-amount-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3mm;
  margin-top: 3.2mm;
}

.invoice-footer {
  padding-top: 2.4mm;
  padding-bottom: 3mm;
  border-top: 0.2mm solid #dbe4f0;
}

.invoice-footer-note {
  margin: 0 0 1.4mm;
}

.invoice-footer-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5mm 4mm;
  font-size: 9px;
}

@media print {
  html,
  body {
    background: #fff;
    margin: 0;
  }

  .print-preview {
    background: #fff !important;
  }

  .sheet {
    width: 100%;
    min-height: auto;
    margin: 0;
    max-width: none;
  }

  .invoice-window-label {
    visibility: hidden;
  }

  .invoice-header,
  .invoice-lines,
  .invoice-summary,
  .invoice-footer,
  .qr-bill,
  .qr-bill-receipt,
  .qr-bill-payment {
    break-inside: avoid;
  }
}
</style>
