<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
}>(), {
  title: 'Confirmer la suppression',
  description: 'Cette action est définitive.',
  confirmLabel: 'Supprimer',
  cancelLabel: 'Annuler'
})

const emit = defineEmits<{
  close: [value: boolean]
}>()
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :dismissible="false"
    :close="false"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton
        :label="cancelLabel"
        color="neutral"
        variant="subtle"
        @click="emit('close', false)"
      />
      <UButton
        :label="confirmLabel"
        color="error"
        variant="solid"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
