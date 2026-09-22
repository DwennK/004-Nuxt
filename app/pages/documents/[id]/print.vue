<script setup lang="ts">
import { savStatusLabels } from '~~/shared/types/sav'
import { createQrCodeDataUrl } from '~~/shared/utils/qr-code'
import '~/assets/css/thermal-print.css'
import '~/assets/css/document-print.css'
import { documentStatusLabels, documentTypeLabels } from '~~/shared/constants/pos'
import type { DocumentDetail, PrintProfile } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { A4_POSTAL_LAYOUT, buildDocumentA4PrintModel } from '~~/shared/utils/document-print'
import { getDocumentPrintProfiles, printProfileLabels, supportsDocumentPrintProfile } from '~~/shared/utils/print'
import type { SwissQrAddress } from '~~/shared/utils/qr-bill'
import { calculateIncludedVatAmount, formatCurrency, formatDate, formatDateTime, isPayableDocumentType } from '~~/shared/utils/pos'

definePageMeta({
  layout: false
})

const printReady = ref(false)
onNuxtReady(() => {
  printReady.value = true
})

const route = useRoute()
const id = computed(() => Number(route.params.id))

const [{ data: document }, { data: company }] = await Promise.all([
  useFetch<DocumentDetail>(() => `/api/documents/${id.value}`),
  useFetch<CompanySettingsRecord>('/api/settings/company')
])

function normalizePrintProfile(value: unknown): PrintProfile {
  const profile = Array.isArray(value) ? value[0] : value

  return profile === 'thermal' ? 'thermal' : 'a4'
}

const profile = computed<PrintProfile>(() => normalizePrintProfile(route.query.profile))
const profileLabel = computed(() => printProfileLabels[profile.value])
const availableProfiles = computed(() => document.value ? getDocumentPrintProfiles(document.value.type) : [])
const canRenderSelectedProfile = computed(() => document.value ? supportsDocumentPrintProfile(document.value.type, profile.value) : false)
const isThermalProfile = computed(() => profile.value === 'thermal')
const printPageRule = computed(() => (
  profile.value === 'thermal'
    ? '@page { margin: 0; }'
    : '@page { size: A4; margin: 7mm; }'
))
const a4PrintModel = computed(() => {
  if (!document.value || !company.value) {
    return null
  }

  return buildDocumentA4PrintModel(document.value, company.value)
})
const printDocumentTitle = computed(() => document.value?.documentNumber || 'Document commercial')
const documentTitle = computed(() => a4PrintModel.value?.documentTitle || (document.value ? documentTypeLabels[document.value.type] : 'Document'))
const payments = computed(() => a4PrintModel.value?.payments || [])
const companyAddress = computed(() => a4PrintModel.value?.companyAddress || [])
const customerAddress = computed(() => a4PrintModel.value?.customerAddress || [])
const paidAmount = computed(() => a4PrintModel.value?.paidAmount || 0)
const isPayableDocument = computed(() => a4PrintModel.value?.isPayableDocument || (document.value ? isPayableDocumentType(document.value.type) : false))
const balanceDue = computed(() => a4PrintModel.value?.balanceDue || 0)

const showThermalCustomer = computed(() => {
  if (!document.value) {
    return false
  }

  const customer = document.value.customer
  const hasContactDetails = Boolean(
    customer.phone
    || customer.email
    || customer.addressLine1
    || customer.addressLine2
    || customer.postalCode
    || customer.city
  )

  return customer.displayName !== 'Client comptoir' || hasContactDetails
})

const qrBill = computed(() => {
  if (isThermalProfile.value) {
    return null
  }

  return a4PrintModel.value?.qrBill || null
})

const { data: qrCodeDataUrl } = await useAsyncData(
  () => `document-print-qr-${id.value}-${profile.value}`,
  async () => {
    if (!qrBill.value) {
      return null
    }

    return createQrCodeDataUrl(qrBill.value.payload, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 220
    })
  },
  {
    watch: [qrBill, profile]
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

useHead(() => ({
  title: printDocumentTitle.value,
  style: [
    {
      key: 'document-print-page-rule',
      textContent: printPageRule.value
    }
  ]
}))
</script>

<template>
  <div class="print-preview min-h-screen bg-muted/20 text-default" :class="`print-preview--${profile}`">
    <div class="print-toolbar border-b border-default bg-default/95 backdrop-blur print:hidden">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div>
          <p class="text-xs uppercase tracking-[0.24em] text-toned">
            Aperçu imprimable · {{ profileLabel }}
          </p>
          <h1 class="text-lg font-semibold text-highlighted">
            {{ document?.documentNumber || 'Document commercial' }}
          </h1>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-if="availableProfiles.includes('a4')"
            :to="`/documents/${id}/print?profile=a4`"
            icon="i-lucide-file-text"
            label="A4"
            :color="profile === 'a4' ? 'primary' : 'neutral'"
            :variant="profile === 'a4' ? 'solid' : 'soft'"
          />
          <UButton
            v-if="availableProfiles.includes('thermal')"
            :to="`/documents/${id}/print?profile=thermal`"
            icon="i-lucide-printer"
            label="Thermique"
            :color="profile === 'thermal' ? 'primary' : 'neutral'"
            :variant="profile === 'thermal' ? 'solid' : 'soft'"
          />
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
        v-if="document && company && canRenderSelectedProfile && profile === 'a4'"
        :data-print-ready="printReady"
        class="sheet sheet--a4 w-full max-w-[210mm] bg-white text-slate-900 shadow-sm ring-1 ring-black/5 print:max-w-none print:shadow-none print:ring-0"
        :class="{ 'sheet--with-qr': !!qrBill }"
        :style="{
          '--a4-address-left': `${A4_POSTAL_LAYOUT.addressLeftMm}mm`,
          '--a4-address-top': `${A4_POSTAL_LAYOUT.addressTopMm}mm`,
          '--a4-address-width': `${A4_POSTAL_LAYOUT.addressWidthMm}mm`,
          '--a4-body-top': `${A4_POSTAL_LAYOUT.bodyTopMm}mm`
        }"
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
                  {{ document.type === 'sav' ? 'Service après-vente' : 'Document commercial' }}
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

            <PosRecordLookupQr :id="id" type="documents" class="invoice-lookup" />

            <div class="invoice-meta">
              <p class="invoice-type">
                {{ documentTitle }}
              </p>
              <p class="invoice-number">
                {{ document.documentNumber }}
              </p>
              <p>Émis le {{ formatDate(document.issuedAt) }}</p>
              <p v-if="document.ticket">
                Réf. dossier {{ document.ticket.ticketNumber }}
              </p>
              <p>
                Statut {{ document.sav ? savStatusLabels[document.sav.status] : documentStatusLabels[document.status] }}
              </p>
            </div>
          </div>

          <div class="invoice-party-row">
            <section class="invoice-party invoice-party--compact">
              <p class="invoice-label">
                Références
              </p>
              <p v-for="line in a4PrintModel?.referenceLines || []" :key="line">
                {{ line }}
              </p>
            </section>

            <section class="invoice-window-wrap">
              <p class="invoice-label invoice-window-label">
                Adresse destinataire
              </p>
              <div class="invoice-window">
                <p class="invoice-strong">
                  {{ a4PrintModel?.windowLines[0] || document.customer.displayName }}
                </p>
                <p v-for="line in (a4PrintModel?.windowLines || []).slice(1)" :key="`customer-${line}`">
                  {{ line }}
                </p>
              </div>
            </section>
          </div>
        </header>

        <section v-if="document.type !== 'sav'" class="invoice-lines">
          <table class="invoice-table">
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Qté</th>
                <th>Prix TTC</th>
                <th>TVA</th>
                <th>TVA CHF</th>
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
                <td>{{ formatCurrency(calculateIncludedVatAmount(line.lineTotal, line.vatRate)) }}</td>
                <td class="text-right">
                  {{ formatCurrency(line.lineTotal) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="payments.length" class="invoice-payments">
          <p class="invoice-label">
            Paiements reçus
          </p>
          <table class="print-payments-table">
            <thead>
              <tr>
                <th scope="col">
                  Date
                </th>
                <th scope="col">
                  Moyen de paiement
                </th>
                <th scope="col">
                  Montant
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="payment in payments" :key="payment.id">
                <td>{{ payment.paidAt }}</td>
                <td>{{ payment.label }}</td>
                <td>{{ formatCurrency(payment.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="invoice-summary">
          <div v-if="document.type !== 'sav'" class="invoice-totals">
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
            <div v-if="isPayableDocument" class="invoice-total-row">
              <span>Encaissé</span>
              <strong>{{ formatCurrency(paidAmount) }}</strong>
            </div>
            <div v-if="isPayableDocument" class="invoice-total-row invoice-total-row--grand">
              <span>Reste à payer</span>
              <strong>{{ formatCurrency(balanceDue) }}</strong>
            </div>
          </div>

          <div v-if="a4PrintModel?.noteBlocks.length" class="invoice-notes">
            <div v-for="block in a4PrintModel.noteBlocks" :key="block.label" class="invoice-note-block">
              <p class="invoice-label">
                {{ block.label }}
              </p>
              <p class="whitespace-pre-line">
                {{ block.content }}
              </p>
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

        <footer v-else-if="a4PrintModel && (a4PrintModel.footerNote || a4PrintModel.footerMeta.length)" class="invoice-footer">
          <p v-if="a4PrintModel.footerNote" class="invoice-footer-note">
            {{ a4PrintModel.footerNote }}
          </p>
          <div class="invoice-footer-meta">
            <span v-for="entry in a4PrintModel.footerMeta" :key="entry">{{ entry }}</span>
          </div>
        </footer>
      </article>

      <article
        v-else-if="document && company && canRenderSelectedProfile && profile === 'thermal'"
        :data-print-ready="printReady"
        class="sheet thermal-sheet bg-white text-slate-900 shadow-sm ring-1 ring-black/5 print:shadow-none print:ring-0"
      >
        <header class="thermal-header">
          <div class="thermal-brand-row">
            <div v-if="company.logoDataUrl" class="thermal-logo">
              <img :src="company.logoDataUrl" :alt="company.name" class="max-h-full max-w-full object-contain">
            </div>

            <div class="thermal-brand-copy">
              <h2 class="thermal-company">
                {{ company.name }}
              </h2>
              <p v-for="line in companyAddress" :key="`thermal-company-${line}`">
                {{ line }}
              </p>
              <p v-if="company.phone">
                {{ company.phone }}
              </p>
            </div>
          </div>

          <div class="thermal-divider" />

          <div class="thermal-meta">
            <div>
              <p class="thermal-kicker">
                Document
              </p>
              <p class="thermal-strong">
                {{ documentTitle }}
              </p>
              <p class="thermal-reference">
                {{ document.documentNumber }}
              </p>
            </div>

            <div class="thermal-meta-right">
              <p>{{ formatDateTime(document.issuedAt) }}</p>
              <p v-if="document.ticket">
                Réf. dossier {{ document.ticket.ticketNumber }}
              </p>
              <p>Statut {{ document.sav ? savStatusLabels[document.sav.status] : documentStatusLabels[document.status] }}</p>
            </div>
          </div>
        </header>

        <PosRecordLookupQr :id="id" type="documents" compact />

        <section v-if="showThermalCustomer" class="thermal-block">
          <p class="thermal-kicker">
            Client
          </p>
          <p class="thermal-strong">
            {{ document.customer.displayName }}
          </p>
          <p v-if="a4PrintModel?.customerContactName">
            {{ a4PrintModel.customerContactName }}
          </p>
          <p v-for="line in customerAddress" :key="`thermal-customer-${line}`">
            {{ line }}
          </p>
          <p v-if="document.customer.phone">
            {{ document.customer.phone }}
          </p>
          <p v-if="document.customer.email">
            {{ document.customer.email }}
          </p>
        </section>

        <section class="thermal-block thermal-lines">
          <p class="thermal-kicker">
            Articles et prestations
          </p>

          <div v-for="line in document.lines" :key="line.id" class="thermal-line">
            <div class="thermal-line-head">
              <p class="thermal-line-label">
                {{ line.label }}
              </p>
              <p class="thermal-line-total">
                {{ formatCurrency(line.lineTotal) }}
              </p>
            </div>
            <div class="thermal-line-meta">
              <span>{{ line.quantity }} x {{ formatCurrency(line.unitPrice) }}</span>
              <span>TVA {{ line.vatRate }}% · {{ formatCurrency(calculateIncludedVatAmount(line.lineTotal, line.vatRate)) }}</span>
            </div>
          </div>
        </section>

        <section class="thermal-block thermal-totals">
          <div class="thermal-total-row">
            <span>Total HT</span>
            <strong>{{ formatCurrency(document.subtotal) }}</strong>
          </div>
          <div class="thermal-total-row">
            <span>TVA</span>
            <strong>{{ formatCurrency(document.taxAmount) }}</strong>
          </div>
          <div class="thermal-total-row thermal-total-row--grand">
            <span>Total TTC</span>
            <strong>{{ formatCurrency(document.total) }}</strong>
          </div>
          <div v-if="isPayableDocument" class="thermal-total-row">
            <span>Encaissé</span>
            <strong>{{ formatCurrency(paidAmount) }}</strong>
          </div>
          <div v-if="isPayableDocument" class="thermal-total-row thermal-strong">
            <span>Reste à payer</span>
            <strong>{{ formatCurrency(balanceDue) }}</strong>
          </div>

          <div v-if="payments.length" class="thermal-note">
            <p class="thermal-kicker">
              Paiements reçus
            </p>
            <table class="print-payments-table">
              <thead>
                <tr>
                  <th scope="col">
                    Date
                  </th>
                  <th scope="col">
                    Moyen
                  </th>
                  <th scope="col">
                    Montant
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="payment in payments" :key="payment.id">
                  <td>{{ payment.paidAt }}</td>
                  <td>{{ payment.label }}</td>
                  <td>{{ formatCurrency(payment.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="document.notes" class="thermal-note">
            <p class="thermal-kicker">
              Notes
            </p>
            <p class="whitespace-pre-line">
              {{ document.notes }}
            </p>
          </div>
        </section>

        <footer class="thermal-footer">
          <p v-if="company.footerNotes">
            {{ company.footerNotes }}
          </p>
          <p v-else>
            Merci pour votre visite.
          </p>
          <p v-if="company.email || company.website">
            {{ [company.email, company.website].filter(Boolean).join(' · ') }}
          </p>
        </footer>
      </article>

      <div
        v-else
        class="flex min-h-[60vh] w-full max-w-3xl items-center justify-center rounded-3xl border border-dashed border-default bg-default px-6 text-center text-sm text-toned"
      >
        {{ canRenderSelectedProfile ? 'Impossible de charger l’aperçu imprimable.' : `Le profil ${profileLabel.toLowerCase()} n’est pas disponible pour ce document.` }}
      </div>
    </main>
  </div>
</template>
