<script setup lang="ts">
import {
  documentStatusColors,
  documentStatusLabels,
  documentTypeColors,
  documentTypeLabels
} from '~~/shared/constants/pos'
import type { DocumentDetail } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const props = defineProps<{
  document: DocumentDetail
  paidAmount: number
  balanceDue: number
  isPayableDocument: boolean
}>()

const emit = defineEmits<{
  editContext: []
}>()
</script>

<template>
  <div class="rounded-2xl border border-default/80 bg-muted/20 px-4 py-3">
    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="documentTypeColors[props.document.type]" variant="subtle" size="sm">
            {{ documentTypeLabels[props.document.type] }}
          </UBadge>
          <UBadge :color="documentStatusColors[props.document.status]" variant="subtle" size="sm">
            {{ documentStatusLabels[props.document.status] }}
          </UBadge>
          <span class="text-sm font-medium text-highlighted">
            {{ props.document.customer.displayName }}
          </span>
          <UButton
            type="button"
            icon="i-lucide-sliders-horizontal"
            label="Modifier le contexte"
            color="neutral"
            variant="soft"
            size="sm"
            class="ml-2"
            @click="emit('editContext')"
          />
        </div>

        <div class="flex flex-wrap gap-2 text-sm text-toned">
          <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
            <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
              Émis le
            </p>
            <p class="mt-1 font-medium text-highlighted">
              {{ formatDateTime(props.document.issuedAt) }}
            </p>
          </div>
          <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
            <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
              Ticket lié
            </p>
            <p class="mt-1 font-medium text-highlighted">
              {{ props.document.ticket ? props.document.ticket.ticketNumber : 'Vente directe / autonome' }}
            </p>
          </div>
          <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
            <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
              Client
            </p>
            <p class="mt-1 font-medium text-highlighted">
              {{ props.document.customer.displayName }}
            </p>
          </div>
        </div>
      </div>

      <div class="grid gap-2 sm:grid-cols-3">
        <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
          <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
            Total
          </p>
          <p class="text-sm font-semibold text-highlighted">
            {{ formatCurrency(props.document.total) }}
          </p>
        </div>
        <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
          <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
            Encaissé
          </p>
          <p class="text-sm font-semibold text-highlighted">
            {{ formatCurrency(props.paidAmount) }}
          </p>
        </div>
        <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
          <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
            {{ props.isPayableDocument ? 'Restant' : 'Type' }}
          </p>
          <p class="text-sm font-semibold text-highlighted">
            {{ props.isPayableDocument ? formatCurrency(props.balanceDue) : documentTypeLabels[props.document.type] }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
