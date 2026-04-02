<script setup lang="ts">
import {
  paymentMethodColors,
  paymentMethodLabels,
  paymentMethods,
  paymentStatusColors,
  paymentStatusLabels,
  paymentStatuses
} from '~~/shared/constants/pos'
import type { PaymentMethod, PaymentRecord, PaymentStatus } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

type PaymentDraft = {
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  paidAt: string
  reference: string
  notes: string
}

const props = defineProps<{
  documentId: number
  customerId: number
  payments: PaymentRecord[]
  documentTotal: number
  balanceDue: number
  isPayableDocument: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const toast = useToast()

const methodItems = paymentMethods.map(method => ({
  label: paymentMethodLabels[method],
  value: method
}))

const statusItems = paymentStatuses.map(status => ({
  label: paymentStatusLabels[status],
  value: status
}))

function toDateTimeLocal(value?: string | null) {
  const date = value ? new Date(value) : new Date()

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (part: number) => String(part).padStart(2, '0')

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function createPaymentDraft(payment?: PaymentRecord): PaymentDraft {
  return {
    method: payment?.method || 'cash',
    status: payment?.status || 'paid',
    amount: payment ? payment.amount / 100 : Math.max(props.balanceDue / 100, 0),
    paidAt: toDateTimeLocal(payment?.paidAt),
    reference: payment?.reference || '',
    notes: payment?.notes || ''
  }
}

const createState = reactive<PaymentDraft>(createPaymentDraft())
const paymentDrafts = ref<Record<number, PaymentDraft>>({})
const deletingId = ref<number | null>(null)
const savingId = ref<number | null>(null)
const creating = ref(false)

watchEffect(() => {
  const nextDrafts: Record<number, PaymentDraft> = {}

  for (const payment of props.payments) {
    nextDrafts[payment.id] = createPaymentDraft(payment)
  }

  paymentDrafts.value = nextDrafts

  if (!creating.value) {
    Object.assign(createState, createPaymentDraft())
  }
})

async function createPayment() {
  creating.value = true

  try {
    await $fetch('/api/payments', {
      method: 'POST',
      body: {
        customerId: props.customerId,
        documentId: props.documentId,
        method: createState.method,
        status: createState.status,
        amount: Math.round((createState.amount || 0) * 100),
        paidAt: new Date(createState.paidAt).toISOString(),
        reference: createState.reference,
        notes: createState.notes
      }
    })

    toast.add({
      title: 'Paiement ajouté',
      color: 'success'
    })
    Object.assign(createState, createPaymentDraft())
    emit('refresh')
  } finally {
    creating.value = false
  }
}

function resetDraft(payment: PaymentRecord) {
  paymentDrafts.value[payment.id] = createPaymentDraft(payment)
}

async function savePayment(payment: PaymentRecord) {
  const draft = paymentDrafts.value[payment.id]

  if (!draft) {
    return
  }

  savingId.value = payment.id

  try {
    await $fetch(`/api/payments/${payment.id}`, {
      method: 'PATCH',
      body: {
        customerId: payment.customerId,
        documentId: payment.documentId,
        method: draft.method,
        status: draft.status,
        amount: Math.round((draft.amount || 0) * 100),
        paidAt: new Date(draft.paidAt).toISOString(),
        reference: draft.reference,
        notes: draft.notes
      }
    })

    toast.add({
      title: 'Paiement mis à jour',
      color: 'success'
    })
    emit('refresh')
  } finally {
    savingId.value = null
  }
}

async function removePayment(payment: PaymentRecord) {
  if (!window.confirm(`Supprimer le paiement de ${formatCurrency(payment.amount)} ?`)) {
    return
  }

  deletingId.value = payment.id

  try {
    await $fetch(`/api/payments/${payment.id}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Paiement supprimé',
      color: 'success'
    })
    emit('refresh')
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="grid gap-4 xl:h-[calc(100vh-24rem)] xl:grid-cols-[minmax(0,1fr)_20rem]">
    <UCard
      :ui="{
        root: 'rounded-[1.75rem] shadow-sm',
        body: 'space-y-3 p-4',
        header: 'p-4 pb-0'
      }"
      class="xl:min-h-0"
    >
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              Paiements du document
            </h2>
            <p class="text-sm text-toned">
              Modifiez directement les paiements existants sans quitter la page.
            </p>
          </div>
          <span class="text-xs text-toned">
            {{ payments.length }} paiement(s)
          </span>
        </div>
      </template>

      <UEmpty
        v-if="!payments.length"
        icon="i-lucide-wallet"
        title="Aucun paiement enregistré"
        description="Ajoutez le premier paiement depuis le rail de droite."
        class="py-10"
      />

      <div v-else class="max-h-[calc(100vh-29rem)] space-y-3 overflow-y-auto pr-1">
        <div
          v-for="payment in payments"
          :key="payment.id"
          class="rounded-2xl border border-default bg-default px-3 py-3"
        >
          <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[9rem_8rem_9rem_minmax(0,1fr)]">
              <UFormField label="Mode">
                <USelect
                  v-model="paymentDrafts[payment.id]!.method"
                  :items="methodItems"
                  value-key="value"
                  size="sm"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Statut">
                <USelect
                  v-model="paymentDrafts[payment.id]!.status"
                  :items="statusItems"
                  value-key="value"
                  size="sm"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Montant">
                <UInputNumber
                  v-model="paymentDrafts[payment.id]!.amount"
                  :min="0"
                  :step="0.05"
                  size="sm"
                  class="w-full"
                  :format-options="{ style: 'currency', currency: 'CHF', currencyDisplay: 'narrowSymbol' }"
                />
              </UFormField>

              <UFormField label="Encaissé à">
                <UInput
                  v-model="paymentDrafts[payment.id]!.paidAt"
                  type="datetime-local"
                  size="sm"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="flex items-start justify-end gap-1">
              <UBadge :color="paymentMethodColors[payment.method]" variant="subtle" size="sm">
                {{ paymentMethodLabels[payment.method] }}
              </UBadge>
              <UBadge :color="paymentStatusColors[payment.status]" variant="subtle" size="sm">
                {{ paymentStatusLabels[payment.status] }}
              </UBadge>
            </div>
          </div>

          <div class="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <UFormField label="Référence">
              <UInput
                v-model="paymentDrafts[payment.id]!.reference"
                size="sm"
                class="w-full"
                placeholder="Référence terminal, TWINT, virement"
              />
            </UFormField>

            <UFormField label="Notes">
              <UTextarea
                v-model="paymentDrafts[payment.id]!.notes"
                :rows="2"
                autoresize
                size="sm"
                class="w-full"
                placeholder="Note de paiement optionnelle"
              />
            </UFormField>

            <div class="flex items-end justify-end gap-2">
              <UButton
                type="button"
                icon="i-lucide-rotate-ccw"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="savingId === payment.id"
                @click="resetDraft(payment)"
              />
              <UButton
                type="button"
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                :loading="deletingId === payment.id"
                @click="removePayment(payment)"
              />
              <UButton
                type="button"
                label="Enregistrer"
                icon="i-lucide-save"
                size="sm"
                :loading="savingId === payment.id"
                @click="savePayment(payment)"
              />
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <div class="space-y-4 xl:min-h-0 xl:overflow-y-auto pr-1">
      <UCard
        :ui="{
          root: 'rounded-[1.75rem] shadow-sm',
          body: 'space-y-4 p-4',
          header: 'p-4 pb-0'
        }"
      >
        <template #header>
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              Nouveau paiement
            </h2>
            <p class="text-sm text-toned">
              Ajoutez un encaissement directement depuis la page du document.
            </p>
          </div>
        </template>

        <div class="rounded-2xl border border-default bg-muted/20 px-4 py-3">
          <p class="text-xs uppercase tracking-wide text-toned">
            {{ isPayableDocument ? 'Restant' : 'Document non payable' }}
          </p>
          <p class="mt-2 text-lg font-semibold text-highlighted">
            {{ isPayableDocument ? formatCurrency(balanceDue) : 'Non applicable' }}
          </p>
        </div>

        <template v-if="isPayableDocument">
          <UFormField label="Mode de paiement">
            <USelect
              v-model="createState.method"
              :items="methodItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <UFormField label="Montant">
              <UInputNumber
                v-model="createState.amount"
                :min="0"
                :step="0.05"
                class="w-full"
                :format-options="{ style: 'currency', currency: 'CHF', currencyDisplay: 'narrowSymbol' }"
              />
            </UFormField>

            <UFormField label="Encaissé à">
              <UInput
                v-model="createState.paidAt"
                type="datetime-local"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField label="Référence">
            <UInput
              v-model="createState.reference"
              class="w-full"
              placeholder="Référence terminal, TWINT, virement"
            />
          </UFormField>

          <UFormField label="Notes">
            <UTextarea
              v-model="createState.notes"
              :rows="3"
              autoresize
              class="w-full"
              placeholder="Note de paiement optionnelle"
            />
          </UFormField>

          <UButton
            type="button"
            label="Ajouter le paiement"
            icon="i-lucide-wallet"
            block
            :loading="creating"
            :disabled="createState.amount <= 0 || !createState.paidAt"
            @click="createPayment"
          />
        </template>
      </UCard>

      <UCard :ui="{ body: 'space-y-3 p-4', header: 'p-4 pb-0' }">
        <template #header>
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              Solde
            </h2>
          </div>
        </template>

        <div class="grid gap-3">
          <div class="rounded-2xl border border-default px-4 py-3">
            <p class="text-xs uppercase tracking-wide text-toned">
              Total document
            </p>
            <p class="mt-1 font-semibold text-highlighted">
              {{ formatCurrency(documentTotal) }}
            </p>
          </div>
          <div class="rounded-2xl border border-default px-4 py-3">
            <p class="text-xs uppercase tracking-wide text-toned">
              Déjà encaissé
            </p>
            <p class="mt-1 font-semibold text-highlighted">
              {{ formatCurrency(payments.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0)) }}
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
