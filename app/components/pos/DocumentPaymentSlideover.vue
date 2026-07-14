<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { paymentMethodLabels, paymentMethods } from '~~/shared/constants/pos'
import type { PaymentMethod } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

const props = defineProps<{
  balanceDue: number
  loading?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

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

watchEffect(() => {
  state.amount = Math.max(props.balanceDue / 100, 0)
})

function onSubmit(event: FormSubmitEvent<Schema>) {
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
    title="Enregistrer un paiement"
    description="Les paiements restent séparés du document pour permettre un reporting de caisse fiable."
    side="right"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
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

        <UFormField label="Mode de paiement" name="method">
          <USelectMenu
            v-model="state.method"
            :items="methodItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

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

        <UFormField label="Notes" name="notes">
          <UTextarea
            v-model="state.notes"
            :rows="4"
            class="w-full"
            placeholder="Note de paiement optionnelle"
          />
        </UFormField>

        <div class="flex justify-end">
          <UButton
            type="submit"
            label="Enregistrer le paiement"
            icon="i-lucide-wallet"
            :loading="props.loading"
            :disabled="props.loading"
          />
        </div>
      </UForm>
    </template>
  </USlideover>
</template>
