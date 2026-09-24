<script setup lang="ts">
import {
  paymentMethodColors,
  paymentMethodLabels,
  paymentMethods,
  paymentStatusColors,
  paymentStatusLabels
} from '~~/shared/constants/pos'
import { canEditPayment } from '~~/shared/domain/payments/rules'
import type { PaymentMethod, PaymentRecord, PaymentStatus } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const $fetch = useDossierFetch()

const props = defineProps<{
  disabled?: boolean
  documentId: number
  payments: PaymentRecord[]
  documentTotal: number
  creditedTotal?: number
  commercialRefundAllowed?: boolean
  balanceDue: number
  isPayableDocument: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const toast = useToast()
const confirmDelete = useConfirmDelete()
const { can } = useCapabilities()
const paymentMutation = useIdempotentMutation()
const paymentOpen = ref(false)
const quickPaymentMethod = ref<PaymentMethod>('cash')
const correctionOpen = ref(false)
const correctionPayment = ref<PaymentRecord | null>(null)
const correctionAction = ref<'refund' | 'void'>('refund')
const editingId = ref<number | null>(null)
function openCorrection(payment: PaymentRecord, action: 'refund' | 'void') {
  correctionPayment.value = payment
  correctionAction.value = action
  correctionOpen.value = true
}
function refundable(payment: PaymentRecord) {
  return payment.refundableAmount ?? Math.max(payment.amount - (payment.refundedAmount || 0), 0)
}
const totalRefunded = computed(() => -props.payments.filter(p => p.status === 'paid' && p.amount < 0).reduce((sum, p) => sum + p.amount, 0))

const methodItems = paymentMethods.map(method => ({
  label: paymentMethodLabels[method],
  value: method
}))

const editablePaymentStatuses: PaymentStatus[] = ['pending', 'paid', 'cancelled']
const statusItems = editablePaymentStatuses.map(status => ({
  label: paymentStatusLabels[status],
  value: status
}))

const paymentDraftController = usePaymentDrafts(toRef(props, 'documentId'), toRef(props, 'payments'))
const paymentDrafts = paymentDraftController.drafts
const dirty = computed(() => props.payments.some(payment => paymentDraftController.isDirty(payment.id)))

const deletingId = ref<number | null>(null)
const savingId = ref<number | null>(null)
const creatingMethod = ref<PaymentMethod | 'details' | null>(null)
const createError = ref<string | null>(null)
const paymentErrors = ref<Record<number, string | null>>({})
const mutationPending = computed(() => Boolean(creatingMethod.value) || savingId.value !== null || deletingId.value !== null)
watch(paymentOpen, () => {
  createError.value = null
})
watch(() => props.documentId, () => {
  createError.value = null
  paymentErrors.value = {}
})
const paidTotal = computed(() => props.payments
  .filter(payment => payment.status === 'paid')
  .reduce((sum, payment) => sum + payment.amount, 0))
const canCreatePayment = computed(() => !props.disabled && props.isPayableDocument && props.balanceDue > 0)
const canAdjustPayments = computed(() => !props.disabled && can('financial:adjust'))
const canDeletePayments = computed(() => canAdjustPayments.value && can('records:delete'))

function isPaymentEditable(payment: PaymentRecord) {
  return canAdjustPayments.value && payment.amount > 0 && !payment.refundedAmount && canEditPayment(payment.status)
}

function isPaymentStatusEditable(payment: PaymentRecord) {
  return isPaymentEditable(payment)
}

async function addPayment(input: {
  method: PaymentMethod
  amount?: number
  notes?: string
}, source: PaymentMethod | 'details') {
  if (props.disabled || mutationPending.value) return
  createError.value = null
  creatingMethod.value = source

  try {
    const scope = `document-payment:${props.documentId}`
    const attempt = paymentMutation.getAttempt(scope, input, () => ({
      ...input,
      paidAt: new Date().toISOString()
    }))

    await $fetch(`/api/documents/${props.documentId}/mark-paid`, {
      method: 'POST',
      headers: { 'Idempotency-Key': attempt.key },
      body: attempt.payload
    })

    paymentMutation.complete(scope)
    toast.add({
      title: 'Paiement enregistré',
      color: 'success'
    })
    paymentOpen.value = false
    emit('refresh')
  } catch (error) {
    createError.value = getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.'
    toast.add({
      title: 'Encaissement impossible',
      description: getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.',
      color: 'error'
    })
  } finally {
    creatingMethod.value = null
  }
}

function createQuickPayment(method: PaymentMethod) {
  return addPayment({ method }, method)
}

function resetDraft(payment: PaymentRecord) {
  if (!isPaymentEditable(payment)) {
    return
  }

  paymentDraftController.reset(payment)
}

async function savePayment(payment: PaymentRecord) {
  if (!isPaymentEditable(payment) || mutationPending.value) {
    return
  }

  paymentErrors.value[payment.id] = null
  const draft = paymentDrafts.value[payment.id]

  if (!draft) {
    return
  }

  savingId.value = payment.id
  const submitted = { ...draft }

  try {
    const saved = await $fetch<PaymentRecord>(`/api/payments/${payment.id}`, {
      method: 'PATCH',
      body: {
        customerId: payment.customerId,
        documentId: payment.documentId,
        method: draft.method,
        status: draft.status,
        amount: Math.round((draft.amount || 0) * 100),
        paidAt: new Date(draft.paidAt).toISOString(),
        notes: draft.notes
      }
    })

    paymentDraftController.acceptSaved(saved, submitted)
    toast.add({
      title: 'Paiement mis à jour',
      color: 'success'
    })
    emit('refresh')
  } catch (error) {
    paymentErrors.value[payment.id] = getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.'
    toast.add({
      title: 'Enregistrement impossible',
      description: getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.',
      color: 'error'
    })
  } finally {
    savingId.value = null
  }
}

async function removePayment(payment: PaymentRecord) {
  if (!canDeletePayments.value || mutationPending.value) {
    return
  }

  const confirmed = await confirmDelete({
    title: `Supprimer le paiement de ${formatCurrency(payment.amount)} ?`,
    description: 'Le paiement sera définitivement supprimé et le solde du document recalculé.'
  })

  if (!confirmed || mutationPending.value) {
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
  } catch (error) {
    paymentErrors.value[payment.id] = getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.'
    toast.add({
      title: 'Suppression impossible',
      description: getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.',
      color: 'error'
    })
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="min-w-0">
    <PosPaymentCorrectionModal
      v-if="correctionPayment"
      v-model:open="correctionOpen"
      :payment="correctionPayment"
      :action="correctionAction"
      :commercial-allowed="!!commercialRefundAllowed"
      :balance-due="balanceDue"
      :disabled="disabled"
      @saved="emit('refresh')"
    />
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
            </div>
            <PosUnsavedChanges :dirty="dirty" :snapshot="JSON.stringify(paymentDrafts, null, 2)" :saving="mutationPending" />
            <span class="text-xs text-toned">
              {{ payments.length }} mouvement(s)
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
            <NuxtLink
              v-if="payment.documentId !== documentId"
              :to="`/documents/${payment.documentId}`"
              class="mb-2 block text-xs text-primary"
            >
              Acompte repris du document précédent
            </NuxtLink>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <UIcon :name="payment.amount < 0 ? 'i-lucide-undo-2' : 'i-lucide-arrow-down-left'" :class="payment.amount < 0 ? 'text-error' : 'text-success'" class="size-4" />
                  <span class="font-medium text-highlighted">{{ payment.amount < 0 ? 'Remboursement' : 'Encaissement' }}</span>
                  <UBadge
                    v-if="payment.status !== 'paid'"
                    :color="paymentStatusColors[payment.status]"
                    variant="subtle"
                    size="sm"
                  >
                    {{ paymentStatusLabels[payment.status] }}
                  </UBadge>
                  <UBadge
                    v-else-if="payment.refundedAmount"
                    color="warning"
                    variant="subtle"
                    size="sm"
                  >
                    {{ refundable(payment) === 0 ? 'Remboursé intégralement' : 'Remboursé en partie' }}
                  </UBadge>
                </div>
                <p class="text-xs text-toned">
                  {{ paymentMethodLabels[payment.method] }} · {{ formatDateTime(payment.paidAt) }} · #{{ payment.id }}
                </p>
                <p v-if="payment.originalPaymentId" class="text-xs text-toned">
                  Lié à l’encaissement #{{ payment.originalPaymentId }}
                </p>
                <p v-if="payment.notes" class="whitespace-pre-line text-sm text-toned">
                  {{ payment.notes }}
                </p>
                <p v-if="payment.voidReason" class="text-sm text-error">
                  {{ payment.voidReason }} · {{ formatDateTime(payment.voidedAt!) }}
                </p>
              </div>
              <div class="text-right">
                <p class="whitespace-nowrap text-lg font-semibold tabular-nums" :class="payment.status === 'cancelled' ? 'text-muted line-through' : payment.amount < 0 ? 'text-error' : 'text-highlighted'">
                  {{ payment.amount > 0 ? '+' : '' }}{{ formatCurrency(payment.amount) }}
                </p>
                <p v-if="payment.refundedAmount && refundable(payment) > 0" class="text-xs text-toned">
                  {{ formatCurrency(refundable(payment)) }} remboursables
                </p>
              </div>
            </div>
            <div v-if="isPayableDocument && canAdjustPayments && payment.status === 'paid' && payment.amount > 0" class="mt-3 flex flex-wrap items-center gap-2">
              <UButton
                v-if="refundable(payment) > 0"
                label="Rembourser"
                icon="i-lucide-undo-2"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="mutationPending"
                @click="openCorrection(payment, 'refund')"
              />
              <UButton
                v-if="!payment.refundedAmount"
                label="Annuler une saisie"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="mutationPending"
                @click="openCorrection(payment, 'void')"
              />
              <UButton
                v-if="isPaymentEditable(payment)"
                :label="editingId === payment.id ? 'Fermer' : 'Modifier la saisie'"
                color="neutral"
                variant="ghost"
                size="sm"
                class="ml-auto"
                @click="editingId = editingId === payment.id ? null : payment.id"
              />
            </div>
            <UButton
              v-if="payment.status === 'pending' && isPaymentEditable(payment)"
              label="Modifier"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="editingId = editingId === payment.id ? null : payment.id"
            />
            <div v-if="editingId === payment.id" class="mt-3 grid gap-3 border-t border-default pt-3">
              <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[9rem_8rem_9rem_minmax(0,1fr)]">
                <UFormField label="Mode">
                  <USelect
                    v-model="paymentDrafts[payment.id]!.method"
                    :items="methodItems"
                    value-key="value"
                    size="sm"
                    class="w-full"
                    :disabled="!isPaymentEditable(payment) || mutationPending"
                  />
                </UFormField>

                <UFormField label="Statut">
                  <USelect
                    v-model="paymentDrafts[payment.id]!.status"
                    :items="payment.status === 'paid' ? statusItems.filter(item => item.value === 'paid') : statusItems"
                    value-key="value"
                    size="sm"
                    class="w-full"
                    :disabled="!isPaymentStatusEditable(payment) || mutationPending"
                  />
                </UFormField>

                <UFormField label="Montant">
                  <UInputNumber
                    v-bind="posInputAttrs"
                    v-model="paymentDrafts[payment.id]!.amount"
                    :min="0"
                    :step="0.05"
                    size="sm"
                    class="w-full"
                    :disabled="!isPaymentEditable(payment) || mutationPending"
                    :format-options="{ style: 'currency', currency: 'CHF', currencyDisplay: 'narrowSymbol' }"
                  />
                </UFormField>

                <UFormField label="Encaissé à">
                  <UInput
                    v-bind="posInputAttrs"
                    v-model="paymentDrafts[payment.id]!.paidAt"
                    type="datetime-local"
                    size="sm"
                    class="w-full"
                    :disabled="!isPaymentEditable(payment) || mutationPending"
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

            <div v-if="editingId === payment.id" class="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
              <UFormField label="Notes">
                <UTextarea
                  v-bind="posInputAttrs"
                  v-model="paymentDrafts[payment.id]!.notes"
                  :rows="2"
                  autoresize
                  size="sm"
                  class="w-full"
                  placeholder="Note de paiement optionnelle"
                  :disabled="!isPaymentEditable(payment) || mutationPending"
                />
              </UFormField>

              <div v-if="isPaymentEditable(payment) || canDeletePayments" class="flex items-end justify-end gap-2">
                <UButton
                  v-if="isPaymentEditable(payment)"
                  type="button"
                  icon="i-lucide-rotate-ccw"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  aria-label="Réinitialiser le paiement"
                  :disabled="mutationPending"
                  @click="resetDraft(payment)"
                />
                <UButton
                  v-if="canDeletePayments && payment.status === 'pending'"
                  type="button"
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  size="sm"
                  aria-label="Supprimer le paiement"
                  :loading="deletingId === payment.id"
                  :disabled="mutationPending"
                  @click="removePayment(payment)"
                />
                <UButton
                  v-if="isPaymentEditable(payment)"
                  type="button"
                  :label="savingId === payment.id ? 'Enregistrement…' : 'Enregistrer les modifications'"
                  :disabled="mutationPending"
                  icon="i-lucide-save"
                  size="sm"
                  :loading="savingId === payment.id"
                  @click="savePayment(payment)"
                />
              </div>
              <div v-else class="flex items-end justify-end pb-2">
                <p class="max-w-64 text-right text-xs text-toned">
                  Paiement annulé ou remboursé : utilisez une écriture de correction dédiée.
                </p>
              </div>
            </div>
            <PosFormFeedback class="mt-2" :saving="savingId === payment.id" :error="paymentErrors[payment.id]" />
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
              <span class="text-toned">Encaissé net</span>
              <span class="font-medium text-highlighted">{{ formatCurrency(paidTotal) }}</span>
            </div>
            <div v-if="totalRefunded" class="flex items-center justify-between gap-3 text-sm">
              <span class="text-toned">Remboursé</span><span class="text-error">{{ formatCurrency(totalRefunded) }}</span>
            </div>
            <div v-if="creditedTotal" class="flex items-center justify-between gap-3 text-sm">
              <span class="text-toned">Réduction commerciale</span><span>{{ formatCurrency(-creditedTotal) }}</span>
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

          <template v-if="isPayableDocument && balanceDue > 0">
            <div class="space-y-2">
              <UFormField label="Mode de paiement">
                <USelect
                  v-model="quickPaymentMethod"
                  :items="methodItems"
                  value-key="value"
                  class="w-full"
                  :disabled="!canCreatePayment || mutationPending"
                />
              </UFormField>
              <UButton
                type="button"
                :label="`Encaisser le solde · ${formatCurrency(balanceDue)}`"
                icon="i-lucide-wallet"
                :loading="creatingMethod === quickPaymentMethod"
                :disabled="!canCreatePayment || mutationPending"
                block
                @click="createQuickPayment(quickPaymentMethod)"
              />
            </div>

            <PosFormFeedback :saving="Boolean(creatingMethod)" :error="createError" />

            <UButton
              type="button"
              label="Acompte / autre montant"
              icon="i-lucide-sliders-horizontal"
              color="neutral"
              variant="soft"
              block
              :loading="creatingMethod === 'details'"
              :disabled="!canCreatePayment || mutationPending"
              @click="paymentOpen = true"
            />
          </template>

          <template v-else-if="!isPayableDocument">
            <UAlert
              icon="i-lucide-info"
              color="neutral"
              variant="subtle"
              title="Document non payable"
              description="Les paiements sont disponibles sur le devis, la commande ou la facture en cours. Un document annulé ou remplacé ne peut plus être encaissé."
            />
          </template>
        </UCard>

        <PosDocumentPaymentSlideover
          v-if="isPayableDocument"
          v-model:open="paymentOpen"
          :disabled="props.disabled"
          :balance-due="balanceDue"
          :initial-method="quickPaymentMethod"
          :save-error="createError"
          :loading="creatingMethod === 'details'"
          @save="addPayment($event, 'details')"
        />
      </div>
    </div>
  </div>
</template>
