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
      textContent: '@page { margin: 4mm; }'
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
            Ticket atelier · Thermique 80 mm
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
                  stroke="#0f172a"
                  stroke-width="3"
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
                      font-size="5"
                      fill="#64748b"
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
  width: 72mm;
  max-width: 72mm;
  padding: 4mm 3mm;
  font-size: 11px;
  line-height: 1.35;
  color: #334155;
  font-variant-numeric: tabular-nums;
}

.ticket-header {
  border-bottom: 0.3mm dashed #cbd5e1;
  padding-bottom: 3mm;
}

.ticket-brand-row {
  display: flex;
  gap: 3mm;
  align-items: flex-start;
}

.ticket-logo {
  width: 12mm;
  height: 12mm;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0.2mm solid #d9e1ed;
  border-radius: 1.6mm;
  overflow: hidden;
  flex-shrink: 0;
}

.ticket-kicker {
  margin: 0 0 1mm;
  font-size: 7.3px;
  line-height: 1.2;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #607393;
}

.ticket-company {
  margin: 0 0 1.4mm;
  font-size: 15px;
  line-height: 1.05;
  font-weight: 700;
  color: #0f172a;
}

.ticket-brand-copy p,
.ticket-block p,
.ticket-footer p,
.ticket-summary-grid p {
  margin: 0 0 1mm;
}

.ticket-divider {
  margin-block: 3mm 2.2mm;
  border-top: 0.3mm dashed #cbd5e1;
}

.ticket-summary-grid {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
}

.ticket-summary-right {
  text-align: right;
}

.ticket-strong {
  font-weight: 700;
  color: #0f172a;
}

.ticket-block {
  padding-block: 3mm;
  border-bottom: 0.3mm dashed #cbd5e1;
}

.ticket-codes {
  background: #f8fafc;
  border-radius: 1.6mm;
  padding-inline: 2mm;
}

.ticket-code-row {
  display: flex;
  align-items: center;
  gap: 3mm;
  padding-block: 1.4mm;
}

.ticket-code-row + .ticket-code-row {
  border-top: 0.2mm dashed #cbd5e1;
}

.ticket-code-label {
  flex: 0 0 18mm;
  font-size: 8.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #475569;
}

.ticket-code-value {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

.ticket-pattern {
  display: flex;
  align-items: center;
  gap: 3mm;
}

.ticket-pattern-svg {
  width: 22mm;
  height: 22mm;
  flex-shrink: 0;
}

.ticket-pattern-sequence {
  font-size: 11px;
  font-weight: 600;
  color: #0f172a;
  letter-spacing: 0.08em;
}

.ticket-footer {
  padding-top: 3mm;
  text-align: center;
  font-size: 10px;
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
    margin: 0 auto;
    box-shadow: none;
  }

  .ticket-header,
  .ticket-block,
  .ticket-footer {
    break-inside: avoid;
  }
}
</style>
