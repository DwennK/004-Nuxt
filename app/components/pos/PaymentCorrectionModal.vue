<script setup lang="ts">
import { z } from 'zod'
import { paymentMethods, paymentMethodLabels } from '~~/shared/constants/pos'
import type { PaymentRecord } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  payment: PaymentRecord
  action: 'refund' | 'void'
  commercialAllowed: boolean
  balanceDue: number
  disabled?: boolean
}>()
const emit = defineEmits<{ saved: [] }>()
const fetch = useDossierFetch()
const mutation = useIdempotentMutation()
const toast = useToast()
const saving = ref(false)
const error = ref<string | null>(null)
const state = reactive({ amount: 0, method: props.payment.method, reason: '', paidAt: '', effect: 'commercial' as 'commercial' | 'payment_correction' })
const available = computed(() => props.payment.refundableAmount ?? props.payment.amount)
const schema = computed(() => z.object({
  reason: z.string().trim().min(3, 'Indiquez un motif précis').max(1000),
  ...(props.action === 'refund'
    ? {
        amount: z.number().positive('Indiquez un montant').max(available.value / 100, 'Le montant dépasse le solde remboursable'),
        paidAt: z.string().min(1, 'Indiquez la date du remboursement').refine(value => Number.isFinite(Date.parse(value)), 'Date invalide')
      }
    : {})
}))
const methodItems = paymentMethods.map(value => ({ value, label: paymentMethodLabels[value] }))
const effects = [
  { value: 'commercial', label: 'Rembourser et réduire le montant dû', description: 'Retour ou geste commercial. Cette somme ne sera plus réclamée au client.' },
  { value: 'payment_correction', label: 'Corriger uniquement le règlement', description: 'La vente est maintenue. Cette somme restera à encaisser.' }
]
const nextBalance = computed(() => props.action === 'void' ? props.balanceDue + props.payment.amount : props.balanceDue + (state.effect === 'payment_correction' ? Math.round((state.amount || 0) * 100) : 0))
watch(open, (value) => {
  if (!value) return
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  Object.assign(state, { amount: available.value / 100, method: props.payment.method, reason: '', paidAt: now.toISOString().slice(0, 19), effect: props.commercialAllowed ? 'commercial' : 'payment_correction' })
  error.value = null
}, { immediate: true })
async function submit() {
  if (saving.value || props.disabled) return
  saving.value = true
  error.value = null
  const payload = props.action === 'refund'
    ? { amount: Math.round(state.amount * 100), method: state.method, reason: state.reason.trim(), paidAt: new Date(state.paidAt).toISOString(), effect: state.effect }
    : { reason: state.reason.trim() }
  const scope = `payment-${props.action}:${props.payment.id}`
  const attempt = mutation.getAttempt(scope, payload, () => payload)
  try {
    await fetch(`/api/payments/${props.payment.id}/${props.action}`, { method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body: attempt.payload })
    mutation.complete(scope)
    toast.add({ title: props.action === 'refund' ? 'Remboursement enregistré' : 'Saisie annulée', color: 'success' })
    emit('saved')
    open.value = false
  } catch (cause) {
    error.value = getRequestErrorMessage(cause) || 'Vérifiez la connexion puis réessayez.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :dismissible="!saving"
    :close="!saving"
    :title="action === 'refund' ? 'Enregistrer un remboursement' : 'Annuler une saisie erronée'"
    :description="action === 'refund' ? 'Enregistre l’argent déjà rendu au client. Aucun virement ou remboursement bancaire n’est déclenché.' : 'À utiliser uniquement si cet argent n’a pas réellement été encaissé. L’annulation reste dans l’historique.'"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-5"
        @submit="submit"
      >
        <div class="flex items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2.5 text-sm">
          <span class="text-toned">Encaissement #{{ payment.id }} · {{ paymentMethodLabels[payment.method] }}</span>
          <strong class="whitespace-nowrap tabular-nums">{{ formatCurrency(payment.amount) }}</strong>
        </div>
        <template v-if="action === 'refund'">
          <div class="grid grid-cols-2 items-end gap-4">
            <UFormField
              name="amount"
              label="Montant (CHF)"
              :description="`Max. ${formatCurrency(available)}`"
              required
            >
              <UInput
                v-model.number="state.amount"
                type="number"
                :min="0.01"
                :max="available / 100"
                :step="0.01"
                class="w-full"
                :disabled="saving"
              />
            </UFormField>
            <UFormField label="Remboursé par" required>
              <USelect
                v-model="state.method"
                :items="methodItems"
                class="w-full"
                :disabled="saving"
              />
            </UFormField>
          </div>
          <UFormField name="paidAt" label="Date du remboursement" required>
            <UInput
              v-model="state.paidAt"
              type="datetime-local"
              :step="1"
              class="w-full"
              :disabled="saving"
            />
          </UFormField>
          <UFormField v-if="commercialAllowed" label="Effet sur la facture">
            <URadioGroup
              v-model="state.effect"
              :items="effects"
              variant="card"
              :disabled="saving"
            />
          </UFormField>
          <UAlert
            v-else
            color="neutral"
            variant="subtle"
            title="Correction du règlement"
            description="Le montant remboursé restera dû sur le document courant. La réduction commerciale est disponible depuis la facture."
          />
        </template>
        <UFormField name="reason" label="Motif" required>
          <UTextarea
            v-model="state.reason"
            :rows="2"
            :maxlength="1000"
            :placeholder="action === 'refund' ? 'Ex. retour accepté, geste commercial…' : 'Ex. encaissement saisi en double…'"
            class="w-full"
            :disabled="saving"
          />
        </UFormField>
        <div class="space-y-2 rounded-lg border border-default p-3 text-sm">
          <div v-if="action === 'refund'" class="flex justify-between gap-3">
            <span class="text-toned">Sortie enregistrée</span><strong class="text-error tabular-nums">{{ formatCurrency(-Math.round((state.amount || 0) * 100)) }}</strong>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-toned">Restant à encaisser après l’opération</span><strong class="tabular-nums">{{ formatCurrency(nextBalance) }}</strong>
          </div>
        </div>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
        />
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            label="Retour"
            color="neutral"
            variant="ghost"
            :disabled="saving"
            @click="open = false"
          />
          <UButton
            type="submit"
            :label="action === 'refund' ? 'Enregistrer le remboursement' : 'Confirmer l’annulation'"
            :icon="action === 'refund' ? 'i-lucide-undo-2' : 'i-lucide-ban'"
            color="error"
            :loading="saving"
            :disabled="disabled"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
