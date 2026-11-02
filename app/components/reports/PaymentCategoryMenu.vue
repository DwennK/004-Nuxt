<script setup lang="ts">
import type { DailySummary } from '~~/shared/types/pos'
import { paymentCategories, paymentCategoryLabels, type PaymentCategoryAllocation } from '~~/shared/types/payment-categories'
import { paymentClassificationLabel } from '~~/shared/utils/payment-categories'
import { formatCurrency } from '~~/shared/utils/pos'

const props = defineProps<{ payment: DailySummary['payments'][number] }>()
const emit = defineEmits<{ saved: [], conflict: [] }>()
const { can } = useCapabilities()
const toast = useToast()
const saving = ref(false)
const splitOpen = ref(false)
const saveError = ref('')
const amounts = ref<(number | null)[]>(paymentCategories.map(() => 0))
const label = computed(() => paymentClassificationLabel(props.payment.classification))
const missing = computed(() => !props.payment.classification.allocations.length)
const allocations = computed(() => paymentCategories.map((category, index) => ({ category, amount: Math.round((amounts.value[index] || 0) * 100) })).filter(item => item.amount > 0))
const remaining = computed(() => Math.abs(props.payment.amount) - allocations.value.reduce((sum, item) => sum + item.amount, 0))
const validSplit = computed(() => remaining.value === 0 && allocations.value.length > 0 && amounts.value.every(value => value == null || (Number.isFinite(value) && value >= 0)))
const detail = computed(() => props.payment.classification.allocations.map(item => `${paymentCategoryLabels[item.category]} : ${formatCurrency(Math.sign(props.payment.amount) * item.amount)}`).join(' · '))
const items = computed(() => [
  paymentCategories.map(category => ({
    label: paymentCategoryLabels[category],
    icon: props.payment.classification.allocations.length === 1 && props.payment.classification.allocations[0]?.category === category ? 'i-lucide-check' : undefined,
    disabled: saving.value || props.payment.amount === 0,
    onSelect: () => save([{ category, amount: Math.abs(props.payment.amount) }])
  })),
  [
    { label: 'Répartir…', icon: 'i-lucide-split', disabled: saving.value || props.payment.amount === 0, onSelect: openSplit },
    { label: 'À catégoriser', icon: 'i-lucide-circle-alert', disabled: saving.value, onSelect: () => save([]) },
    { label: 'Reprendre la suggestion automatique', icon: 'i-lucide-rotate-ccw', disabled: saving.value, onSelect: () => save(null) }
  ]
])

function openSplit() {
  amounts.value = paymentCategories.map(category => (props.payment.classification.allocations.find(item => item.category === category)?.amount || 0) / 100)
  saveError.value = ''
  splitOpen.value = true
}

async function save(value: PaymentCategoryAllocation[] | null) {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/payments/${props.payment.id}/classification`, {
      method: 'PUT',
      body: { allocations: value, expectedRevision: props.payment.classification.revision, expectedAmount: props.payment.amount }
    })
    splitOpen.value = false
    emit('saved')
  } catch (error) {
    saveError.value = getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.'
    toast.add({ title: 'Catégorie non enregistrée', description: saveError.value, color: 'error' })
    if ((error as { statusCode?: number }).statusCode === 409) {
      splitOpen.value = false
      emit('conflict')
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <UDropdownMenu v-if="can('financial:record')" :items="items" :content="{ align: 'start' }">
      <UButton
        :label="label"
        :aria-label="`Catégorie du mouvement ${payment.documentNumber || payment.id} : ${label}`"
        :title="[detail, payment.classification.source === 'automatic' && !missing ? 'Suggestion automatique' : ''].filter(Boolean).join(' · ')"
        :color="missing ? 'error' : 'neutral'"
        :variant="missing ? 'soft' : 'ghost'"
        :icon="missing ? 'i-lucide-circle-alert' : undefined"
        trailing-icon="i-lucide-chevron-down"
        size="xs"
        :loading="saving"
        :disabled="saving"
        :class="missing ? 'font-semibold' : ''"
      />
    </UDropdownMenu>
    <UBadge
      v-else
      :label="label"
      :color="missing ? 'error' : 'neutral'"
      variant="soft"
      :title="detail"
    />
    <span v-if="payment.classification.allocations.length > 1" class="mt-1 block max-w-56 text-xs text-muted">{{ detail }}</span>

    <UModal
      v-model:open="splitOpen"
      title="Répartir le mouvement"
      :description="`${payment.documentNumber || 'Paiement'} · ${formatCurrency(payment.amount)}`"
      :dismissible="!saving"
    >
      <template #body>
        <form id="payment-category-split" class="space-y-3" @submit.prevent="validSplit && save(allocations)">
          <p v-if="payment.amount < 0" class="text-sm text-toned">
            Saisissez les montants remboursés en positif. Ils seront déduits des catégories.
          </p>
          <div v-for="(category, index) in paymentCategories" :key="category" class="flex items-center justify-between gap-4">
            <label :for="`split-${payment.id}-${category}`" class="text-sm">{{ paymentCategoryLabels[category] }}</label>
            <PosMoneyInput
              :id="`split-${payment.id}-${category}`"
              v-model="amounts[index]"
              :min="0"
              :max="Math.abs(payment.amount) / 100"
              :step="0.01"
              :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
              :increment="false"
              :decrement="false"
              :disabled="saving"
              class="w-36"
            />
          </div>
          <p class="border-t border-default pt-3 text-sm font-semibold" :class="remaining ? 'text-error' : 'text-success'">
            {{ remaining < 0 ? 'Dépassement' : 'Reste à répartir' }} : {{ formatCurrency(Math.abs(remaining)) }}
          </p>
          <UAlert
            v-if="saveError"
            :description="saveError"
            title="Enregistrement impossible"
            color="error"
          />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Annuler"
            color="neutral"
            variant="ghost"
            :disabled="saving"
            @click="splitOpen = false"
          />
          <UButton
            label="Enregistrer"
            type="submit"
            form="payment-category-split"
            :disabled="!validSplit || saving"
            :loading="saving"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
