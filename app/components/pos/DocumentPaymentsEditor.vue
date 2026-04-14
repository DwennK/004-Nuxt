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
  payments: PaymentRecord[]
  documentTotal: number
  balanceDue: number
  isPayableDocument: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const toast = useToast()
const paymentOpen = ref(false)

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

const paymentDrafts = ref<Record<number, PaymentDraft>>({})
const deletingId = ref<number | null>(null)
const savingId = ref<number | null>(null)
const creatingMethod = ref<PaymentMethod | 'details' | null>(null)
const paidTotal = computed(() => props.payments
  .filter(payment => payment.status === 'paid')
  .reduce((sum, payment) => sum + payment.amount, 0))
const canCreatePayment = computed(() => props.isPayableDocument && props.balanceDue > 0)

watchEffect(() => {
  const nextDrafts: Record<number, PaymentDraft> = {}

  for (const payment of props.payments) {
    nextDrafts[payment.id] = createPaymentDraft(payment)
  }

  paymentDrafts.value = nextDrafts
})

async function addPayment(input: {
  method: PaymentMethod
  amount?: number
  reference?: string
  notes?: string
}, source: PaymentMethod | 'details') {
  creatingMethod.value = source

  try {
    await $fetch(`/api/documents/${props.documentId}/mark-paid`, {
      method: 'POST',
      body: {
        ...input,
        paidAt: new Date().toISOString()
      }
    })

    toast.add({
      title: 'Paiement ajouté',
      color: 'success'
    })
    paymentOpen.value = false
    emit('refresh')
  } finally {
    creatingMethod.value = null
  }
}

function createQuickPayment(method: PaymentMethod) {
  return addPayment({ method }, method)
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
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <h2 class="text-base font-semibold text-highlighted">
                Encaissement
              </h2>
              <p class="text-sm text-toned">
                Raccourcis opérateur pour solder rapidement le document.
              </p>
            </div>
            <UBadge :color="canCreatePayment ? 'primary' : 'neutral'" variant="soft" size="sm">
              {{ !isPayableDocument ? 'Non payable' : canCreatePayment ? 'Prêt à encaisser' : 'Soldé' }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-2 rounded-2xl border border-default bg-default/70 px-4 py-3">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="text-toned">Total document</span>
            <span class="font-medium text-highlighted">{{ formatCurrency(documentTotal) }}</span>
          </div>
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="text-toned">Déjà encaissé</span>
            <span class="font-medium text-highlighted">{{ formatCurrency(paidTotal) }}</span>
          </div>
          <div class="flex items-center justify-between gap-3 border-t border-default pt-3">
            <span class="text-sm font-medium text-highlighted">
              {{ isPayableDocument ? 'Restant' : 'Statut' }}
            </span>
            <span class="text-xl font-semibold text-highlighted">
              {{ isPayableDocument ? formatCurrency(balanceDue) : 'Non payable' }}
            </span>
          </div>
        </div>

        <template v-if="isPayableDocument">
          <div class="space-y-2">
            <h3 class="text-sm font-medium text-highlighted">
              Paiement direct
            </h3>

            <div class="grid gap-2">
              <UButton
                v-for="method in paymentMethods"
                :key="method"
                type="button"
                :label="`Encaisser · ${paymentMethodLabels[method]}`"
                :icon="creatingMethod === method ? 'i-lucide-loader-circle' : 'i-lucide-badge-check'"
                :loading="creatingMethod === method"
                :disabled="!canCreatePayment || Boolean(creatingMethod)"
                size="lg"
                class="justify-center"
                @click="createQuickPayment(method)"
              />
            </div>
          </div>

          <UButton
            type="button"
            label="Paiement détaillé"
            icon="i-lucide-sliders-horizontal"
            color="neutral"
            variant="soft"
            block
            :loading="creatingMethod === 'details'"
            :disabled="!canCreatePayment || Boolean(creatingMethod)"
            @click="paymentOpen = true"
          />

          <p class="text-xs text-toned">
            Utilisez le paiement détaillé pour un montant partiel, une référence terminal ou une note.
          </p>
        </template>

        <template v-else>
          <UAlert
            icon="i-lucide-info"
            color="neutral"
            variant="subtle"
            title="Document non payable"
            description="Cette section reste disponible uniquement pour les reçus et factures."
          />
        </template>
      </UCard>

      <UCard
        v-if="payments.length"
        :ui="{ body: 'space-y-3 p-4', header: 'p-4 pb-0' }"
      >
        <template #header>
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              Dernier paiement
            </h2>
          </div>
        </template>

        <div class="rounded-2xl border border-default px-4 py-3">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="paymentMethodColors[payments[0]!.method]" variant="subtle" size="sm">
              {{ paymentMethodLabels[payments[0]!.method] }}
            </UBadge>
            <UBadge :color="paymentStatusColors[payments[0]!.status]" variant="subtle" size="sm">
              {{ paymentStatusLabels[payments[0]!.status] }}
            </UBadge>
          </div>
          <p class="mt-3 text-lg font-semibold text-highlighted">
            {{ formatCurrency(payments[0]!.amount) }}
          </p>
          <p class="mt-1 text-sm text-toned">
            {{ payments[0]!.reference || 'Sans référence' }}
          </p>
          <p v-if="payments[0]!.notes" class="mt-2 text-sm text-toned">
            {{ payments[0]!.notes }}
          </p>
        </div>
      </UCard>

      <PosDocumentPaymentSlideover
        v-if="isPayableDocument"
        v-model:open="paymentOpen"
        :balance-due="balanceDue"
        :loading="creatingMethod === 'details'"
        @save="addPayment($event, 'details')"
      />
    </div>
  </div>
</template>
