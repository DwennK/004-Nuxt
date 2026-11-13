<script setup lang="ts">
import { paymentMethodColors, paymentMethodLabels, paymentMethods } from '~~/shared/constants/pos'
import type { PaymentMethod } from '~~/shared/types/pos'
import { formatCurrency, parseCurrencyInput } from '~~/shared/utils/pos'

const props = defineProps<{
  amount: number
  disabled?: boolean
  loading?: boolean
  loadingMethod?: PaymentMethod | null
  shortcuts?: boolean
  inline?: boolean
}>()

const cashReceived = defineModel<number | null>('cashReceived', { default: null })
const emit = defineEmits<{
  pay: [method: PaymentMethod, notes?: string]
}>()

const icons: Record<PaymentMethod, string> = {
  cash: 'i-lucide-banknote',
  card_twint: 'i-lucide-credit-card',
  bank_transfer: 'i-lucide-landmark',
  stripe: 'i-simple-icons-stripe',
  shopify: 'i-simple-icons-shopify'
}

const busy = computed(() => props.loading || Boolean(props.loadingMethod))
const unavailable = computed(() => props.disabled || busy.value || props.amount <= 0)
const receivedCents = computed(() => cashReceived.value === null ? props.amount : parseCurrencyInput(cashReceived.value))
const cashDifference = computed(() => receivedCents.value - props.amount)
const enoughCash = computed(() => Number.isFinite(receivedCents.value) && cashDifference.value >= 0)

function pay(method: PaymentMethod) {
  if (unavailable.value || (method === 'cash' && !enoughCash.value)) return
  emit('pay', method, method === 'cash'
    ? `Reçu ${formatCurrency(receivedCents.value)} · Monnaie ${formatCurrency(cashDifference.value)}`
    : undefined)
}

defineShortcuts({
  f2: { usingInput: true, handler: () => { if (props.shortcuts) pay('cash') } },
  f3: { usingInput: true, handler: () => { if (props.shortcuts) pay('card_twint') } }
})
</script>

<template>
  <div :class="inline ? 'min-w-0' : 'space-y-3'">
    <UFormField v-if="!inline" label="Reçu en espèces (CHF)" hint="Facultatif">
      <PosMoneyInput
        v-bind="posInputAttrs"
        v-model="cashReceived"
        placeholder="Montant exact"
        icon="i-lucide-banknote"
        :min="0"
        :step="0.05"
        :increment="false"
        :decrement="false"
        :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
        :disabled="unavailable"
        class="w-full"
      />
    </UFormField>

    <div v-if="!inline && cashReceived !== null" class="flex items-center justify-between gap-2 text-sm" aria-live="polite">
      <span class="text-toned">{{ enoughCash ? 'Monnaie à rendre' : 'Montant manquant' }}</span>
      <strong class="tabular-nums" :class="enoughCash ? 'text-success' : 'text-error'">
        {{ formatCurrency(Math.abs(cashDifference)) }}
      </strong>
    </div>

    <div :class="inline ? 'flex flex-wrap items-center gap-2' : 'grid grid-cols-2 gap-2'" role="group" aria-label="Enregistrer le paiement">
      <UButton
        v-for="method in paymentMethods"
        :key="method"
        type="button"
        :icon="icons[method]"
        :color="method === 'stripe' ? 'secondary' : method === 'shopify' ? 'success' : paymentMethodColors[method]"
        :variant="method === 'cash' || method === 'card_twint' ? 'solid' : 'soft'"
        :loading="loadingMethod === method"
        :disabled="unavailable || (method === 'cash' && !enoughCash)"
        :aria-keyshortcuts="shortcuts && method === 'cash' ? 'F2' : shortcuts && method === 'card_twint' ? 'F3' : undefined"
        class="min-w-0 justify-start px-3"
        :class="inline ? 'h-9 shrink-0' : 'min-h-11'"
        @click="pay(method)"
      >
        <span class="min-w-0 text-left leading-tight" :class="inline ? 'whitespace-nowrap' : 'whitespace-normal'">{{ paymentMethodLabels[method] }}</span>
        <span v-if="shortcuts && (method === 'cash' || method === 'card_twint')" class="ml-auto text-xs opacity-75">
          {{ method === 'cash' ? 'F2' : 'F3' }}
        </span>
      </UButton>
    </div>
  </div>
</template>
