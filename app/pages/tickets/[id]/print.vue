<script setup lang="ts">
import '~/assets/css/thermal-print.css'
import { ticketStatusLabels, ticketTypeLabels } from '~~/shared/constants/pos'
import type { TicketDetail } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { printProfileLabels, supportsTicketPrintProfile } from '~~/shared/utils/print'
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
  <div class="print-preview print-preview--thermal min-h-screen bg-muted/20 text-default">
    <div class="print-toolbar border-b border-default bg-default/95 backdrop-blur print:hidden">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div>
          <p class="text-xs uppercase tracking-[0.24em] text-toned">
            Dossier client · {{ printProfileLabels.thermal }}
          </p>
          <h1 class="text-lg font-semibold text-highlighted">
            {{ ticket?.ticketNumber || 'Dossier client' }}
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
        class="thermal-sheet bg-white text-slate-900 shadow-sm ring-1 ring-black/5 print:shadow-none print:ring-0"
      >
        <header class="thermal-header">
          <div class="thermal-brand-row">
            <div v-if="company.logoDataUrl" class="thermal-logo">
              <img :src="company.logoDataUrl" :alt="company.name" class="max-h-full max-w-full object-contain">
            </div>

            <div class="thermal-brand-copy">
              <p class="thermal-kicker">
                Réception atelier
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

        <PosRecordLookupQr :id="id" type="tickets" compact />

        <section class="thermal-block">
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

        <section class="thermal-block">
          <p class="thermal-kicker">
            Appareil
          </p>
          <p class="thermal-strong">
            {{ deviceLabel }}
          </p>
          <p v-if="ticket.issueDescription">
            {{ ticket.issueDescription }}
          </p>
        </section>

        <section v-if="hasCodesSection" class="thermal-block">
          <p class="thermal-kicker">
            Codes
          </p>

          <div v-if="ticket.accessCode" class="ticket-code-row">
            <p class="thermal-kicker">
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
            <p class="thermal-kicker">
              SIM (PIN/PUK)
            </p>
            <p class="ticket-code-value">
              {{ ticket.simCode }}
            </p>
          </div>
        </section>

        <section class="thermal-block">
          <p class="thermal-kicker">
            Suivi
          </p>
          <p>
            Statut actuel: {{ ticket.workflow.currentStatusLabel }}
          </p>
          <p>
            Prochaine étape: {{ ticket.workflow.nextActionLabel }}
          </p>
        </section>

        <footer class="thermal-footer">
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
.ticket-code-row {
  padding-block: 1.5mm;
  break-inside: avoid;
}

.ticket-code-row + .ticket-code-row {
  border-top: 0.125mm solid #000;
}

.ticket-code-value {
  font-size: 14pt;
  line-height: 1.2;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.ticket-pattern {
  display: flex;
  align-items: center;
  gap: 3mm;
  break-inside: avoid;
}

.ticket-pattern-svg {
  width: 24mm;
  height: 24mm;
  flex-shrink: 0;
}

.ticket-pattern-sequence {
  font-size: 12pt;
  font-weight: 700;
}
</style>
