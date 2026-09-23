<script setup lang="ts">
import type { DocumentDetail } from '~~/shared/types/pos'

const props = defineProps<{ document: DocumentDetail, disabled?: boolean }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const { can } = useCapabilities()
const $fetch = useDossierFetch()
const mutation = useIdempotentMutation()
const { isSaving, saveError, save } = useFormAction()
const targets = computed(() => {
  const document = props.document
  if (!can('financial:record') || document.status === 'cancelled'
    || (document.ticket?.status === 'cancelled' || (document.ticket?.status === 'closed' && !document.savId))
    || (document.settlement?.activeDocument && document.settlement.activeDocument.id !== document.id)) return []
  const candidates = document.type === 'quote'
    ? ['customer_order', 'invoice'] as const
    : document.type === 'customer_order' ? ['invoice'] as const : []
  return candidates.filter(type => !document.relatedDocuments?.some(related => related.type === type && related.savId === document.savId))
})
watch(isSaving, value => emit('busy', value), { flush: 'sync' })

async function convert(type: 'customer_order' | 'invoice') {
  if (props.disabled || isSaving.value) return
  const id = props.document.id
  const scope = `convert:${id}:${type}`
  const attempt = mutation.getAttempt(scope, { type }, () => ({ type }))
  const result = await save(() => $fetch<DocumentDetail>(`/api/documents/${id}/convert`, {
    method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body: attempt.payload
  }), { success: type === 'invoice' ? 'Facture ouverte' : 'Commande ouverte' })
  if (!result?.ok) return
  mutation.complete(scope)
  await navigateTo(`/documents/${result.data.id}`)
}
</script>

<template>
  <div v-if="targets.length" class="flex flex-wrap items-center gap-2" aria-label="Suite du document">
    <UButton
      v-for="type in targets"
      :key="type"
      :label="type === 'invoice' ? 'Créer une facture' : 'Créer une commande'"
      :icon="type === 'invoice' ? 'i-lucide-file-check-2' : 'i-lucide-shopping-bag'"
      :variant="type === 'invoice' && document.type === 'quote' ? 'outline' : 'solid'"
      :disabled="disabled"
      :loading="isSaving"
      @click="convert(type)"
    />
    <span v-if="!document.ticketId" class="text-xs text-muted">Un dossier de vente regroupera les deux documents.</span>
    <p v-if="saveError" role="alert" class="w-full text-sm text-error">
      {{ saveError }}
    </p>
  </div>
</template>
