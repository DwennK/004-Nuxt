<script setup lang="ts">
import type { MobileSentrixOrder } from '~~/shared/types/mobilesentrix-orders'

defineProps<{ order: MobileSentrixOrder }>()
const toast = useToast()
async function copyTracking(number: string) {
  try {
    await navigator.clipboard.writeText(number)
    toast.add({ title: 'Numéro de suivi copié', color: 'success' })
  } catch {
    toast.add({ title: 'Copie impossible', description: 'Sélectionnez le numéro pour le copier.', color: 'warning' })
  }
}
</script>

<template>
  <div class="min-w-0 text-xs">
    <p class="break-words text-muted">
      {{ order.carrier || 'Transporteur non communiqué' }}
    </p>
    <div v-if="order.trackingNumber" class="flex flex-wrap items-center gap-1">
      <UButton
        v-if="order.trackingUrl"
        :to="order.trackingUrl"
        :label="order.trackingNumber"
        :aria-label="`Suivre le colis de la commande ${order.number} sur FedEx`"
        target="_blank"
        rel="noopener noreferrer"
        trailing-icon="i-lucide-external-link"
        variant="link"
        size="xs"
        class="px-0"
      />
      <span v-else class="select-all break-all">{{ order.trackingNumber }}</span>
      <UButton
        icon="i-lucide-copy"
        :aria-label="`Copier le suivi de la commande ${order.number}`"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="copyTracking(order.trackingNumber)"
      />
    </div>
    <p v-else class="mt-1 text-muted">
      Suivi non communiqué
    </p>
  </div>
</template>
