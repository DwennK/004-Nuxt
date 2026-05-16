<script setup lang="ts">
const props = withDefaults(defineProps<{
  count?: number
  ids?: number[]
}>(), {
  count: 0,
  ids: () => []
})

const open = ref(false)
const toast = useToast()

async function onSubmit() {
  if (!props.ids.length) {
    open.value = false
    return
  }

  try {
    await $fetch('/api/smartphone-reservations/bulk-delete', {
      method: 'POST',
      body: {
        ids: props.ids
      }
    })

    toast.add({
      title: 'Demandes supprimées',
      description: `${props.ids.length} demande${props.ids.length > 1 ? 's' : ''} retirée${props.ids.length > 1 ? 's' : ''}.`,
      color: 'success'
    })
    open.value = false
    await refreshNuxtData('smartphone-reservation-requests')
  } catch (error) {
    const description = error instanceof Error ? error.message : 'Suppression impossible'
    toast.add({
      title: 'Erreur',
      description,
      color: 'error'
    })
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Supprimer ${props.count} demande${props.count > 1 ? 's' : ''}`"
    description="Cette action est définitive."
  >
    <slot />

    <template #body>
      <div class="flex justify-end gap-2">
        <UButton
          label="Annuler"
          color="neutral"
          variant="subtle"
          @click="open = false"
        />
        <UButton
          label="Supprimer"
          color="error"
          variant="solid"
          loading-auto
          @click="onSubmit"
        />
      </div>
    </template>
  </UModal>
</template>
