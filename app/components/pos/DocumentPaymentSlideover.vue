<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { paymentMethodLabels, paymentMethods } from '~~/shared/constants/pos'
import type { PaymentMethod } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'
import type { DossierClientState } from '~/utils/dossier-client'

const props = withDefaults(defineProps<{
  balanceDue: number
  disabled?: boolean
  loading?: boolean
  saveError?: string | null
  initialMethod?: PaymentMethod
}>(), {
  initialMethod: 'cash'
})

const open = defineModel<boolean>('open', { default: false })
const focusReturn = usePosFocusReturn(open)
const { $dossiers } = useNuxtApp()
const dossier = inject<ComputedRef<DossierClientState | null> | null>('pos-dossier-state', null)
const reserving = ref(false)
const editingDisabled = computed(() => props.disabled || reserving.value)

const emit = defineEmits<{
  save: [payload: { method: PaymentMethod, amount: number, notes: string }]
}>()

const schema = z.object({
  method: z.enum(paymentMethods),
  amount: z.coerce.number().positive('Le montant doit être supérieur à zéro'),
  notes: z.string().optional().default('')
})

type Schema = z.output<typeof schema>

const methodItems = paymentMethods.map(method => ({
  label: paymentMethodLabels[method],
  value: method
}))

const state = reactive<Schema>({
  method: 'cash',
  amount: 0,
  notes: ''
})

const snapshot = computed(() => JSON.stringify(state, null, 2))
const initialSnapshot = ref(snapshot.value)
const dirty = computed(() => open.value && snapshot.value !== initialSnapshot.value)

watch(open, async (value) => {
  if (!value) return
  Object.assign(state, { method: props.initialMethod, amount: Math.max(props.balanceDue / 100, 0), notes: '' })
  initialSnapshot.value = snapshot.value
  if (!dossier?.value) return
  reserving.value = true
  try {
    await $dossiers.session(dossier.value, 'acquire')
  } catch { /* The dossier banner preserves the connection/conflict state. */ } finally { reserving.value = false }
})

function onSubmit(event: FormSubmitEvent<Schema>) {
  if (props.loading || editingDisabled.value) return
  emit('save', {
    method: event.data.method,
    amount: Math.round((event.data.amount || 0) * 100),
    notes: event.data.notes
  })
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :content="focusReturn"
    :dismissible="!props.loading"
    :close="!props.loading"
    title="Enregistrer un paiement"
    description="Encaissez tout ou partie du montant restant."
    side="right"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        :disabled="props.loading || editingDisabled"
        :aria-busy="props.loading"
        class="space-y-4"
        @submit="onSubmit"
      >
        <div class="rounded-2xl border border-default bg-muted/20 px-4 py-3">
          <p class="text-xs uppercase tracking-wide text-toned">
            Reste à payer
          </p>
          <p class="mt-2 text-lg font-semibold text-highlighted">
            {{ formatCurrency(balanceDue) }}
          </p>
        </div>

        <UFormField label="Montant (CHF)" name="amount">
          <UInputNumber
            v-model="state.amount"
            :min="0.05"
            :max="balanceDue / 100"
            :step="0.05"
            :format-options="{ style: 'currency', currency: 'CHF', currencyDisplay: 'narrowSymbol' }"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Mode de paiement" name="method">
          <USelect
            v-model="state.method"
            :items="methodItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Notes" name="notes">
          <UTextarea
            v-model="state.notes"
            :rows="4"
            class="w-full"
            placeholder="Note de paiement optionnelle"
          />
        </UFormField>

        <PosFormFeedback :saving="props.loading" :error="props.saveError" />
        <PosUnsavedChanges :dirty="dirty" :snapshot="snapshot" :saving="props.loading" />

        <div class="flex justify-end">
          <UButton
            type="submit"
            :label="props.loading ? 'Enregistrement…' : 'Enregistrer le paiement'"
            icon="i-lucide-wallet"
            :loading="props.loading"
            :disabled="props.loading || editingDisabled"
          />
        </div>
      </UForm>
    </template>
  </USlideover>
</template>
