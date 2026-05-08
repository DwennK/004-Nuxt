<script setup lang="ts">
import { ticketStatusLabels, ticketTypeLabels } from '~~/shared/constants/pos'
import type { TicketDetail } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { supportsTicketPrintProfile } from '~~/shared/utils/print'
import { formatDateTime } from '~~/shared/utils/pos'

definePageMeta({
  layout: false
})

const route = useRoute()
const id = computed(() => Number(route.params.id))
const canRenderThermal = supportsTicketPrintProfile('thermal')

const [{ data: ticket }, { data: company }] = await Promise.all([
  useFetch<TicketDetail>(() => `/api/tickets/${id.value}`),
  useFetch<CompanySettingsRecord>('/api/settings/company')
])
useHead({
  style: [
    {
      key: 'ticket-print-page-rule',
      textContent: '@page { margin: 0; }'
    }
  ]
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

const deviceLabel = computed(() => {
  if (!ticket.value) {
    return 'Appareil'
  }

  return [ticket.value.brand, ticket.value.model].filter(Boolean).join(' ').trim() || 'Appareil non renseigné'
})

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
  <div class="print-preview min-h-screen bg-muted/20 text-default">
    <div class="print-toolbar border-b border-default bg-default/95 backdrop-blur print:hidden">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div>
          <p class="text-xs uppercase tracking-[0.24em] text-toned">
            Ticket atelier · Thermique POS-58
          </p>
          <h1 class="text-lg font-semibold text-highlighted">
            {{ ticket?.ticketNumber || 'Ticket atelier' }}
          </h1>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Retour"
            @click="navigateTo(`/tickets/${id}`)"
          />
          <UButton
            icon="i-lucide-printer"
            label="Imprimer"
            @click="printTicket"
          />
        </div>
      </div>
    </div>

    <main class="mx-auto flex max-w-5xl justify-center px-3 py-4 sm:px-6 sm:py-6 print:max-w-none print:px-0 print:py-0">
      <article
        v-if="ticket && company && canRenderThermal"
        class="ticket-sheet bg-white text-slate-900 shadow-sm ring-1 ring-black/5 print:shadow-none print:ring-0"
      >
        <header class="ticket-header">
          <div class="ticket-brand-row">
            <div v-if="company.logoDataUrl" class="ticket-logo">
              <img :src="company.logoDataUrl" :alt="company.name" class="max-h-full max-w-full object-contain">
            </div>

            <div class="ticket-brand-copy">
              <p class="ticket-kicker">
                Réception atelier
              </p>
              <h2 class="ticket-company">
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

          <div class="ticket-divider" />

          <div class="ticket-summary-grid">
            <div>
              <p class="ticket-kicker">
                Ticket
              </p>
              <p class="ticket-strong">
                {{ ticket.ticketNumber }}
              </p>
              <p>{{ ticketTypeLabels[ticket.type] }}</p>
            </div>

            <div class="ticket-summary-right">
              <p>{{ formatDateTime(ticket.openedAt) }}</p>
              <p>{{ ticketStatusLabels[ticket.status] }}</p>
            </div>
          </div>
        </header>

        <section class="ticket-block">
          <p class="ticket-kicker">
            Client
          </p>
          <p class="ticket-strong">
            {{ ticket.customer.displayName }}
          </p>
          <p v-if="ticket.customer.phone">
            {{ ticket.customer.phone }}
          </p>
          <p v-if="ticket.customer.email">
            {{ ticket.customer.email }}
          </p>
        </section>

        <section class="ticket-block">
          <p class="ticket-kicker">
            Appareil
          </p>
          <p class="ticket-strong">
            {{ deviceLabel }}
          </p>
          <p>
            {{ ticket.issueDescription }}
          </p>
        </section>

        <section v-if="hasCodesSection" class="ticket-block ticket-codes">
          <p class="ticket-kicker">
            Codes
          </p>

          <div v-if="ticket.accessCode" class="ticket-code-row">
            <p class="ticket-code-label">
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
                      fill="#0f172a"
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
            <p class="ticket-code-label">
              SIM (PIN/PUK)
            </p>
            <p class="ticket-code-value">
              {{ ticket.simCode }}
            </p>
          </div>
        </section>

        <section class="ticket-block">
          <p class="ticket-kicker">
            Suivi
          </p>
          <p>
            Statut actuel: {{ ticket.workflow.currentStatusLabel }}
          </p>
          <p>
            Prochaine étape: {{ ticket.workflow.nextActionLabel }}
          </p>
        </section>

        <footer class="ticket-footer">
          <p>
            Présentez ce ticket lors du retrait ou du suivi en magasin.
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
        Impossible de charger le ticket atelier imprimable.
      </div>
    </main>
  </div>
</template>

<style>
body {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.ticket-sheet {
  box-sizing: border-box;
  width: 48mm;
  max-width: 48mm;
  padding: 2mm 1.8mm 3mm;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12.5px;
  line-height: 1.28;
  font-weight: 600;
  color: #000;
  font-variant-numeric: tabular-nums;
}

.ticket-header {
  border-bottom: 0.35mm solid #000;
  padding-bottom: 2mm;
}

.ticket-brand-row {
  display: flex;
  gap: 2mm;
  align-items: flex-start;
}

.ticket-logo {
  width: 10mm;
  height: 10mm;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0.25mm solid #000;
  border-radius: 0;
  overflow: hidden;
  flex-shrink: 0;
}

.ticket-kicker {
  margin: 0 0 0.8mm;
  font-size: 8.5px;
  line-height: 1.15;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #000;
  font-weight: 800;
}

.ticket-company {
  margin: 0 0 1mm;
  font-size: 16px;
  line-height: 1.05;
  font-weight: 900;
  color: #000;
}

.ticket-brand-copy p,
.ticket-block p,
.ticket-footer p,
.ticket-summary-grid p {
  margin: 0 0 1mm;
}

.ticket-divider {
  margin-block: 2mm 1.6mm;
  border-top: 0.35mm solid #000;
}

.ticket-summary-grid {
  display: flex;
  justify-content: space-between;
  gap: 2mm;
}

.ticket-summary-right {
  text-align: right;
}

.ticket-strong {
  font-weight: 900;
  color: #000;
}

.ticket-block {
  padding-block: 2.2mm;
  border-bottom: 0.35mm solid #000;
}

.ticket-codes {
  background: #fff;
  border-radius: 0;
  padding-inline: 0;
}

.ticket-code-row {
  display: block;
  padding-block: 1.4mm;
}

.ticket-code-row + .ticket-code-row {
  border-top: 0.3mm solid #000;
}

.ticket-code-label {
  margin-bottom: 0.8mm;
  font-size: 9px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #000;
  font-weight: 800;
}

.ticket-code-value {
  font-size: 17px;
  line-height: 1.1;
  font-weight: 900;
  color: #000;
  letter-spacing: 0.03em;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.ticket-pattern {
  display: flex;
  align-items: center;
  gap: 2mm;
}

.ticket-pattern-svg {
  width: 20mm;
  height: 20mm;
  flex-shrink: 0;
}

.ticket-pattern-sequence {
  font-size: 13px;
  font-weight: 900;
  color: #000;
  letter-spacing: 0.03em;
}

.ticket-footer {
  padding-top: 2.4mm;
  text-align: center;
  font-size: 11.5px;
  color: #000;
  font-weight: 600;
}

@media print {
  html,
  body {
    background: #fff;
    margin: 0;
  }

  .print-preview {
    background: #fff !important;
    min-height: 0 !important;
  }

  .print-preview > main {
    display: block !important;
    max-width: none !important;
    padding: 0 !important;
  }

  .ticket-sheet {
    margin: 0;
    box-shadow: none;
  }

  .ticket-header,
  .ticket-block,
  .ticket-footer {
    break-inside: avoid;
  }
}
</style>
