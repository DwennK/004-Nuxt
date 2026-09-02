<script setup lang="ts">
import type { ShopifyImportResult } from '~~/shared/types/shopify'

const props = defineProps<{ documentId: number }>()
const emit = defineEmits<{ refresh: [] }>()
const pending = ref(false)
const toast = useToast()

async function sync() {
  if (pending.value) return
  pending.value = true
  try {
    const result = await $fetch<ShopifyImportResult>('/api/tools/shopify/payments', { method: 'POST', body: { documentId: props.documentId } })
    toast.add({ title: result.paymentsAdded ? `${result.paymentsAdded} paiement(s) ajouté(s)` : 'Paiements déjà à jour', color: 'success' })
    emit('refresh')
  } catch (error) {
    const data = error as { data?: { statusMessage?: string } }
    toast.add({ title: 'Actualisation impossible', description: data.data?.statusMessage || 'Impossible de récupérer les paiements Shopify.', color: 'error' })
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UButton
    label="Actualiser les paiements"
    icon="i-lucide-refresh-cw"
    color="neutral"
    variant="outline"
    size="sm"
    :loading="pending"
    @click="sync"
  />
</template>
