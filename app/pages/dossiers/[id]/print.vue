<script setup lang="ts">
import '~/assets/css/thermal-print.css'
import '~/assets/css/document-print.css'
import { A4_POSTAL_LAYOUT } from '~~/shared/utils/document-print'
import { calculateCommercialTotals } from '~~/shared/domain/commercial/money'
import { ticketStatusLabels, ticketTypeLabels } from '~~/shared/constants/pos'
import type { PrintProfile, TicketDetail } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { getTicketPrintProfiles, printProfileLabels, supportsTicketPrintProfile } from '~~/shared/utils/print'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

definePageMeta({
  layout: false
})

const printReady = ref(false)
onNuxtReady(() => {
  printReady.value = true
})

const route = useRoute()
const id = computed(() => Number(route.params.id))
const profile = computed<PrintProfile>(() => {
  const value = Array.isArray(route.query.profile) ? route.query.profile[0] : route.query.profile
  return value === 'a4' ? 'a4' : 'thermal'
})
const availableProfiles = getTicketPrintProfiles()
const canRenderSelectedProfile = computed(() => supportsTicketPrintProfile(profile.value))

const [{ data: ticket }, { data: company }] = await Promise.all([
  useFetch<TicketDetail>(() => `/api/tickets/${id.value}`),
  useFetch<CompanySettingsRecord>('/api/settings/company')
])
useHead(() => ({
  title: ticket.value?.ticketNumber || 'Dossier client',
  style: [
    {
      key: 'ticket-print-page-rule',
      textContent: profile.value === 'a4' ? '@page { size: A4; margin: 7mm; }' : '@page { margin: 0; }'
    }
  ]
}))

const companyAddress = computed(() => {
  if (!company.value) {
    return []
  }

  return [
    company.value.address,
    [company.value.postalCode, company.value.city].filter(Boolean).join(' ').trim() || null
  ].filter((line): line is string => Boolean(line))
})

const customerWindowLines = computed(() => {
  const customer = ticket.value?.customer
  if (!customer) return []

  const personName = [customer.firstName, customer.lastName].map(part => part.trim()).filter(Boolean).join(' ')
  const contactName = customer.companyName?.trim()
    && personName.toLocaleLowerCase('fr-CH') !== customer.displayName.trim().toLocaleLowerCase('fr-CH')
    ? personName
    : null

  return [
    customer.displayName,
    contactName,
    customer.addressLine1,
    customer.addressLine2,
    [customer.postalCode, customer.city].filter(Boolean).join(' ')
  ].filter((line): line is string => Boolean(line))
})

const deviceLabel = computed(() => {
  if (!ticket.value) {
    return 'Appareil'
  }

  return [ticket.value.brand, ticket.value.model].filter(Boolean).join(' ').trim() || 'Appareil non renseigné'
})

const lineTotals = computed(() => calculateCommercialTotals(ticket.value?.lines || []))

function parsePatternPoints(value?: string | null) {
  if (!value?.toLowerCase().startsWith('pattern')) {
    return []
  }

  return value
    .replace(/pattern/i, '')
    .split(/[^0-9]+/)
    .map(part => Number(part))
    .filter(point => Number.isInteger(point) && point >= 1 && point <= 9)
    .filter((point, index, array) => array.indexOf(point) === index)
}

const patternPoints = computed(() => parsePatternPoints(ticket.value?.accessCode))
const isAccessPattern = computed(() => patternPoints.value.length > 0)

const patternPath = computed(() => {
  return patternPoints.value
    .map((point) => {
      const col = (point - 1) % 3
      const row = Math.floor((point - 1) / 3)
      const x = 20 + col * 30
      const y = 20 + row * 30
      return `${x},${y}`
    })
    .join(' ')
})

const hasCodesSection = computed(() => {
  return Boolean(ticket.value?.accessCode || ticket.value?.simCode)
})

function printTicket() {
  window.print()
}
</script>

<template>
  <div class="ticket-print-preview print-preview min-h-screen bg-muted/20 text-default" :class="`print-preview--${profile}`">
    <div class="print-toolbar border-b border-default bg-default/95 backdrop-blur print:hidden">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div>
          <p class="text-xs uppercase tracking-[0.24em] text-toned">
            Dossier client · {{ printProfileLabels[profile] }}
          </p>
          <h1 class="text-lg font-semibold text-highlighted">
            {{ ticket?.ticketNumber || 'Dossier client' }}
          </h1>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-for="option in availableProfiles"
            :key="option"
            :to="`/dossiers/${id}/print?profile=${option}`"
            :icon="option === 'a4' ? 'i-lucide-file-text' : 'i-lucide-printer'"
            :label="option === 'a4' ? 'A4' : 'Thermique'"
            :color="profile === option ? 'primary' : 'neutral'"
            :variant="profile === option ? 'solid' : 'soft'"
          />
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Retour"
            @click="navigateTo(`/dossiers/${id}`)"
          />
          <UButton
            icon="i-lucide-printer"
            label="Imprimer"
            @click="printTicket"
          />
        </div>
      </div>
    </div>

    <main class="mx-auto flex max-w-6xl justify-center px-3 py-4 sm:px-6 sm:py-6 print:max-w-none print:px-0 print:py-0">
      <article
        v-if="ticket && company && canRenderSelectedProfile"
        :data-print-ready="printReady"
        class="bg-white text-slate-900 shadow-sm ring-1 ring-black/5 print:shadow-none print:ring-0"
        :class="profile === 'a4' ? 'sheet sheet--a4 ticket-sheet--a4 w-full max-w-[210mm] print:max-w-none' : 'thermal-sheet'"
        :style="profile === 'a4' ? {
          '--a4-address-left': `${A4_POSTAL_LAYOUT.addressLeftMm}mm`,
          '--a4-address-top': `${A4_POSTAL_LAYOUT.addressTopMm}mm`,
          '--a4-address-width': `${A4_POSTAL_LAYOUT.addressWidthMm}mm`,
          '--a4-body-top': `${A4_POSTAL_LAYOUT.bodyTopMm}mm`
        } : undefined"
      >
        <header v-if="profile === 'a4'" class="invoice-header">
          <div class="invoice-head">
            <div class="invoice-brand">
              <div v-if="company.logoDataUrl" class="invoice-logo">
                <img :src="company.logoDataUrl" :alt="company.name" class="max-h-full max-w-full object-contain">
              </div>
              <div>
                <p class="invoice-kicker">
                  {{ ticket.type === 'sale' ? 'Dossier de vente' : 'Réception atelier' }}
                </p>
                <h2 class="invoice-company">
                  {{ company.name }}
                </h2>
                <div class="invoice-company-meta">
                  <p v-for="line in companyAddress" :key="line">
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
            <PosRecordLookupQr :id="id" type="tickets" class="invoice-lookup" />
            <div class="invoice-meta">
              <p class="invoice-type">
                Dossier client
              </p>
              <p class="invoice-number">
                {{ ticket.ticketNumber }}
              </p>
              <p>Ouvert le {{ formatDateTime(ticket.openedAt) }}</p>
              <p>Statut {{ ticketStatusLabels[ticket.status] }}</p>
            </div>
          </div>
          <div class="invoice-party-row">
            <section class="invoice-party invoice-party--compact">
              <p class="invoice-label">
                Références
              </p>
              <p>{{ ticketTypeLabels[ticket.type] }}</p>
              <p v-if="ticket.customer.phone">
                {{ ticket.customer.phone }}
              </p>
              <p v-if="ticket.customer.email">
                {{ ticket.customer.email }}
              </p>
            </section>
            <section class="invoice-window-wrap">
              <p class="invoice-label invoice-window-label">
                Adresse destinataire
              </p>
              <div class="invoice-window">
                <p class="invoice-strong">
                  {{ customerWindowLines[0] }}
                </p>
                <p v-for="(line, index) in customerWindowLines.slice(1)" :key="index">
                  {{ line }}
                </p>
              </div>
            </section>
          </div>
        </header>
        <header v-else class="thermal-header">
          <div class="thermal-brand-row">
            <div v-if="company.logoDataUrl" class="thermal-logo">
              <img :src="company.logoDataUrl" :alt="company.name" class="max-h-full max-w-full object-contain">
            </div>

            <div class="thermal-brand-copy">
              <p class="thermal-kicker">
                {{ ticket.type === 'sale' ? 'Dossier de vente' : 'Réception atelier' }}
              </p>
              <h2 class="thermal-company">
                {{ company.name }}
              </h2>
              <p v-for="line in companyAddress" :key="`company-${line}`">
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
                Dossier client
              </p>
              <p class="thermal-reference">
                {{ ticket.ticketNumber }}
              </p>
              <p>{{ ticketTypeLabels[ticket.type] }}</p>
            </div>

            <div class="thermal-meta-right">
              <p>{{ formatDateTime(ticket.openedAt) }}</p>
              <p>{{ ticketStatusLabels[ticket.status] }}</p>
            </div>
          </div>
        </header>

        <PosRecordLookupQr
          v-if="profile === 'thermal'"
          :id="id"
          type="tickets"
          compact
        />

        <section v-if="profile === 'thermal'" class="thermal-block">
          <p class="thermal-kicker">
            Client
          </p>
          <p class="thermal-strong">
            {{ ticket.customer.displayName }}
          </p>
          <p v-if="ticket.customer.phone">
            {{ ticket.customer.phone }}
          </p>
          <p v-if="ticket.customer.email">
            {{ ticket.customer.email }}
          </p>
        </section>

        <section class="ticket-intake" :class="profile === 'a4' ? 'ticket-a4-section' : 'thermal-block'">
          <div class="ticket-device">
            <p :class="profile === 'a4' ? 'invoice-label' : 'thermal-kicker'">
              {{ ticket.type === 'sale' ? 'Vente' : 'Appareil' }}
            </p>
            <p v-if="ticket.type !== 'sale'" class="thermal-strong">
              {{ deviceLabel }}
            </p>
            <p v-if="ticket.issueDescription">
              {{ ticket.issueDescription }}
            </p>
          </div>

          <div
            v-if="hasCodesSection"
            class="ticket-codes"
            role="group"
            aria-label="Codes d’accès"
          >
            <div v-if="ticket.accessCode" class="ticket-code-row">
              <p :class="profile === 'a4' ? 'invoice-label' : 'thermal-kicker'">
                Déverrouillage
              </p>
              <div v-if="isAccessPattern" class="ticket-pattern">
                <svg viewBox="0 0 100 100" class="ticket-pattern-svg" aria-label="Schéma de déverrouillage">
                  <polyline
                    v-if="patternPath"
                    :points="patternPath"
                    fill="none"
                    stroke="#000"
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <g>
                    <template v-for="point in 9" :key="point">
                      <circle
                        :cx="20 + ((point - 1) % 3) * 30"
                        :cy="20 + Math.floor((point - 1) / 3) * 30"
                        r="4"
                        fill="#000"
                      />
                      <text
                        :x="20 + ((point - 1) % 3) * 30"
                        :y="20 + Math.floor((point - 1) / 3) * 30 + 11"
                        text-anchor="middle"
                        font-size="6"
                        fill="#000"
                      >
                        {{ point }}
                      </text>
                    </template>
                  </g>
                </svg>
                <p class="ticket-pattern-sequence">
                  {{ patternPoints.join(' - ') }}
                </p>
              </div>
              <p v-else class="ticket-code-value">
                {{ ticket.accessCode }}
              </p>
            </div>

            <div v-if="ticket.simCode" class="ticket-code-row">
              <p :class="profile === 'a4' ? 'invoice-label' : 'thermal-kicker'">
                SIM (PIN/PUK)
              </p>
              <p class="ticket-code-value">
                {{ ticket.simCode }}
              </p>
            </div>
          </div>
        </section>

        <template v-if="lineTotals.lines.length">
          <section v-if="profile === 'a4'" class="invoice-lines ticket-print-lines" aria-label="Articles et prestations">
            <table class="invoice-table">
              <thead>
                <tr>
                  <th scope="col">
                    Désignation
                  </th>
                  <th scope="col">
                    Qté
                  </th>
                  <th scope="col">
                    Prix TTC
                  </th>
                  <th scope="col">
                    TVA
                  </th>
                  <th scope="col">
                    TVA CHF
                  </th>
                  <th scope="col">
                    Total TTC
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in lineTotals.lines" :key="line.id">
                  <td class="invoice-desc">
                    {{ line.label }}
                  </td>
                  <td>{{ line.quantity }}</td>
                  <td>{{ formatCurrency(line.unitPrice) }}</td>
                  <td>{{ line.vatRate }}%</td>
                  <td>{{ formatCurrency(line.taxAmount) }}</td>
                  <td>{{ formatCurrency(line.lineTotal) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-else class="thermal-block thermal-lines" aria-label="Articles et prestations">
            <p class="thermal-kicker">
              Articles et prestations
            </p>
            <div v-for="line in lineTotals.lines" :key="line.id" class="thermal-line">
              <div class="thermal-line-head">
                <p class="thermal-line-label whitespace-pre-line">
                  {{ line.label }}
                </p>
                <p class="thermal-line-total">
                  {{ formatCurrency(line.lineTotal) }}
                </p>
              </div>
              <div class="thermal-line-meta">
                <span>{{ line.quantity }} x {{ formatCurrency(line.unitPrice) }}</span>
                <span>TVA {{ line.vatRate }}% · {{ formatCurrency(line.taxAmount) }}</span>
              </div>
            </div>
          </section>

          <section
            :class="profile === 'a4' ? 'invoice-summary ticket-print-summary' : 'thermal-block thermal-totals'"
            aria-label="Total des lignes du dossier"
          >
            <div :class="profile === 'a4' ? 'invoice-totals' : undefined">
              <div :class="profile === 'a4' ? 'invoice-total-row' : 'thermal-total-row'">
                <span>Total HT</span>
                <strong>{{ formatCurrency(lineTotals.subtotal) }}</strong>
              </div>
              <div :class="profile === 'a4' ? 'invoice-total-row' : 'thermal-total-row'">
                <span>TVA</span>
                <strong>{{ formatCurrency(lineTotals.taxAmount) }}</strong>
              </div>
              <div :class="profile === 'a4' ? 'invoice-total-row invoice-total-row--grand' : 'thermal-total-row thermal-total-row--grand'">
                <span>Total TTC</span>
                <strong>{{ formatCurrency(lineTotals.total) }}</strong>
              </div>
            </div>
          </section>
        </template>

        <section :class="profile === 'a4' ? 'ticket-a4-section' : 'thermal-block'">
          <p :class="profile === 'a4' ? 'invoice-label' : 'thermal-kicker'">
            Suivi
          </p>
          <p>
            Statut actuel: {{ ticket.workflow.currentStatusLabel }}
          </p>
          <p>
            Prochaine étape: {{ ticket.workflow.nextActionLabel }}
          </p>
        </section>

        <footer :class="profile === 'a4' ? 'invoice-footer' : 'thermal-footer'">
          <p>
            Présentez cette fiche lors du retrait ou du suivi en magasin.
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
        Impossible de charger le dossier client imprimable.
      </div>
    </main>
  </div>
</template>

<style>
.ticket-print-lines .invoice-table thead {
  background: #222;
}

.ticket-print-lines .invoice-table th {
  letter-spacing: normal;
  text-transform: none;
}

.ticket-print-lines .invoice-table th,
.ticket-print-lines .invoice-table td {
  border-bottom-color: #ddd;
}

.ticket-print-lines .invoice-desc,
.ticket-print-summary .invoice-totals {
  color: #111;
}

.ticket-print-summary .invoice-totals {
  background: #f8f8f8;
  border-color: #ddd;
}

.ticket-print-summary .invoice-total-row + .invoice-total-row {
  border-color: #ddd;
}

@media print {
  .ticket-print-lines {
    break-inside: auto;
  }

  .ticket-print-lines tr {
    break-inside: avoid;
  }
}

.ticket-a4-section {
  padding: 3mm 5.8mm;
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.ticket-a4-section + .ticket-a4-section {
  border-top: 0.2mm solid #dbe4f0;
}

.ticket-a4-section > p:not(.invoice-label) {
  margin: 0 0 1mm;
  white-space: pre-line;
}

.ticket-a4-section > .invoice-label {
  break-after: avoid;
}

.ticket-intake {
  display: grid;
  gap: 3mm;
  align-items: start;
}

.ticket-sheet--a4 .ticket-intake:has(.ticket-codes) {
  grid-template-columns: minmax(0, 1fr) 78mm;
  gap: 6mm;
}

.ticket-device {
  min-width: 0;
}

.ticket-device > p:not(.invoice-label):not(.thermal-kicker) {
  margin: 0 0 1mm;
  white-space: pre-line;
}

.ticket-codes {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  padding-block: 2.5mm;
  border: 0.2mm solid #ddd;
  border-radius: 1.5mm;
  background: #f8f8f8;
  color: #111;
  break-inside: avoid;
}

.ticket-code-row {
  min-width: 0;
  padding-inline: 3mm;
}

.ticket-code-row + .ticket-code-row {
  border-left: 0.2mm solid #ddd;
}

.ticket-codes .invoice-label {
  color: #666;
  letter-spacing: 0.12em;
}

.ticket-codes p:last-child {
  margin-bottom: 0;
}

.ticket-code-value {
  font-size: 11pt;
  line-height: 1.2;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.ticket-sheet--a4 .ticket-code-value {
  font-size: 13px;
}

.thermal-sheet .ticket-codes {
  background: #fff;
  border-color: #000;
}

.thermal-sheet .ticket-code-row + .ticket-code-row {
  border-color: #000;
}

.thermal-sheet .ticket-codes .thermal-kicker {
  font-size: 8pt;
}

.ticket-pattern {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1mm;
}

.ticket-pattern-svg {
  width: 20mm;
  height: 20mm;
  flex-shrink: 0;
}

.ticket-pattern-sequence {
  font-size: 8pt;
  font-weight: 700;
}
</style>
