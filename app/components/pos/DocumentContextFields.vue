<script setup lang="ts">
import type { CustomerRecord } from '~~/shared/types/pos'
import type { DocumentDraftController } from '~~/app/composables/useDocumentDraft'
import { formatCurrency } from '~~/shared/utils/pos'

const props = withDefaults(defineProps<{
  editor: DocumentDraftController
  customers: CustomerRecord[]
  submitLabel?: string
  fixedCustomerId?: number | null
}>(), {
  submitLabel: 'Enregistrer le document',
  fixedCustomerId: null
})

const state = props.editor.state
const totals = props.editor.totals
const documentTypeItems = props.editor.documentTypeItems
const documentStatusItems = props.editor.documentStatusItems
</script>

<template>
  <div class="space-y-4 xl:sticky xl:top-3">
    <UCard
      variant="subtle"
      :ui="{
        root: 'rounded-[2rem] shadow-sm',
        body: 'space-y-4 p-4 sm:p-4',
        header: 'p-4 pb-0 sm:p-4 sm:pb-0'
      }"
    >
      <template #header>
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <h2 class="text-base font-semibold text-highlighted">
                Contexte document
              </h2>
              <p class="text-sm text-toned">
                Client, type, statut et date restent éditables sans quitter les lignes.
              </p>
            </div>
            <UBadge color="primary" variant="soft" size="sm">
              {{ editor.state.lines.length ? `${editor.state.lines.length} ligne(s)` : 'Sans ligne' }}
            </UBadge>
          </div>

          <UButton
            type="submit"
            icon="i-lucide-save"
            :label="submitLabel"
            size="lg"
            block
          />
        </div>
      </template>

      <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <UFormField label="Type de document" name="type">
          <USelectMenu
            v-model="state.type"
            :items="documentTypeItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Statut" name="status">
          <USelectMenu
            v-model="state.status"
            :items="documentStatusItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField label="Client" name="customerId">
        <PosCustomerSelectField
          :model-value="state.customerId || null"
          :customers="props.customers"
          placeholder="Rechercher ou créer un client"
          :disabled="fixedCustomerId !== null"
          @update:model-value="state.customerId = $event || 0"
        />
      </UFormField>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <UFormField label="Émis le" name="issuedAt">
          <UInput
            v-model="state.issuedAt"
            type="datetime-local"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Ticket lié" name="ticketId">
          <UInput
            :model-value="state.ticketId ? String(state.ticketId) : 'Vente directe / document autonome'"
            :disabled="true"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField label="Notes" name="notes">
        <UTextarea
          v-model="state.notes"
          :rows="3"
          placeholder="Notes internes ou imprimables"
          class="w-full"
        />
      </UFormField>

      <div class="space-y-2 rounded-2xl border border-default bg-default/70 px-4 py-3">
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="text-toned">Sous-total HT</span>
          <span class="font-medium text-highlighted">{{ formatCurrency(totals.subtotal) }}</span>
        </div>
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="text-toned">TVA</span>
          <span class="font-medium text-highlighted">{{ formatCurrency(totals.taxAmount) }}</span>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-default pt-3">
          <span class="text-sm font-medium text-highlighted">Total TTC</span>
          <span class="text-xl font-semibold text-highlighted">{{ formatCurrency(totals.total) }}</span>
        </div>
      </div>
    </UCard>
  </div>
</template>
