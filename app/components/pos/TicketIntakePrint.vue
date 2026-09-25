<script setup lang="ts">
import type { PrintProfile } from '~~/shared/types/pos'
import type { TicketIntakePrintModel } from '~~/shared/types/print'

defineProps<{ model: TicketIntakePrintModel, profile: PrintProfile }>()

function patternPath(points: number[]) {
  return points.map(point => `${20 + ((point - 1) % 3) * 30},${20 + Math.floor((point - 1) / 3) * 30}`).join(' ')
}
</script>

<template>
  <section class="ticket-intake" :class="[`ticket-intake--${profile}`, profile === 'thermal' ? 'thermal-block' : undefined]">
    <div class="ticket-device">
      <p :class="profile === 'a4' ? 'invoice-label' : 'thermal-kicker'">
        {{ model.title }}
      </p>
      <p v-if="model.deviceLabel" class="thermal-strong">
        {{ model.deviceLabel }}
      </p>
      <p v-if="model.description">
        {{ model.description }}
      </p>
    </div>
    <div
      v-if="model.codes.length"
      class="ticket-codes"
      role="group"
      aria-label="Codes d’accès"
    >
      <div v-for="code in model.codes" :key="code.label" class="ticket-code-row">
        <p :class="profile === 'a4' ? 'invoice-label' : 'thermal-kicker'">
          {{ code.label }}
        </p>
        <div v-if="code.patternPoints.length" class="ticket-pattern">
          <svg viewBox="0 0 100 100" class="ticket-pattern-svg" aria-label="Schéma de déverrouillage">
            <polyline
              :points="patternPath(code.patternPoints)"
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
                >{{ point }}</text>
              </template>
            </g>
          </svg>
          <p class="ticket-pattern-sequence">
            {{ code.patternPoints.join(' - ') }}
          </p>
        </div>
        <p v-else class="ticket-code-value">
          {{ code.value }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ticket-intake--a4 {
  padding: 3mm 5.8mm;
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.ticket-intake {
  display: grid;
  gap: 3mm;
  align-items: start;
}

.ticket-intake--a4:has(.ticket-codes) {
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

.ticket-intake--a4 .ticket-code-value {
  font-size: 13px;
}

.ticket-intake--thermal .ticket-codes {
  background: #fff;
  border-color: #000;
}

.ticket-intake--thermal .ticket-code-row + .ticket-code-row {
  border-color: #000;
}

.ticket-intake--thermal .ticket-codes .thermal-kicker {
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
