<script setup lang="ts">
import { savStatusLabels } from '~~/shared/types/sav'
import { waitForPdfFrame } from '~/utils/pdf-print'
import '~/assets/css/thermal-print.css'
import '~/assets/css/document-print.css'
import { documentStatusLabels, documentTypeLabels } from '~~/shared/constants/pos'
import type { DocumentDetail, PrintProfile } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { buildDocumentA4PrintModel } from '~~/shared/utils/document-print'
import { getDocumentPrintProfiles, printProfileLabels, supportsDocumentPrintProfile } from '~~/shared/utils/print'
import { calculateIncludedVatAmount, formatCurrency, formatDateTime, isPayableDocumentType } from '~~/shared/utils/pos'

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

const pdfUrl = computed(() => `/api/documents/${id.value}/pdf?inline=1#view=FitH&navpanes=0`)
const pdfFrame = ref<HTMLIFrameElement>()
const pdfReady = ref(false)
const pdfError = ref(false)

function printDocument() {
  if (profile.value === 'a4') {
    pdfFrame.value?.contentWindow?.focus()
    pdfFrame.value?.contentWindow?.print()
    return
  }
  window.print()
}

watch([pdfFrame, pdfUrl, profile], async ([frame], _previous, onCleanup) => {
  let active = true
  onCleanup(() => {
    active = false
  })
  pdfReady.value = false
  pdfError.value = false
  if (!frame) return
  try {
    const ready = await waitForPdfFrame(frame, () => active)
    if (active) pdfReady.value = ready
  } catch {
    if (active) pdfError.value = true
  }
}, { flush: 'post' })

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
            :disabled="profile === 'a4' && !pdfReady"
            @click="printDocument"
          />
        </div>
      </div>
    </div>

    <main class="mx-auto flex max-w-6xl flex-wrap justify-center px-3 py-4 sm:px-6 sm:py-6 print:max-w-none print:px-0 print:py-0">
      <UAlert
        v-if="pdfError"
        title="Impossible de charger le PDF"
        description="Rechargez la page pour réessayer."
        color="error"
        class="mb-3 w-full"
      />
      <iframe
        v-if="document && company && canRenderSelectedProfile && profile === 'a4'"
        ref="pdfFrame"
        :src="pdfUrl"
        :title="`PDF ${document.documentNumber}`"
        class="h-[calc(100dvh-13rem)] min-h-96 w-full border-0 bg-white sm:h-[calc(100dvh-9rem)]"
        @error="pdfError = true"
      />

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
              <p>Statut {{ document.sav ? savStatusLabels[document.sav.status] : (document.creditedTotal && document.creditedTotal === document.total ? 'Remboursée' : documentStatusLabels[document.status]) }}</p>
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
            <span>Encaissé net</span>
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
