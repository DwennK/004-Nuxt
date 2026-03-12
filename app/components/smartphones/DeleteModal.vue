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
    await $fetch('/api/smartphone-stocks', {
      method: 'DELETE',
      body: {
        ids: props.ids
      }
    })

    toast.add({
      title: 'Smartphones supprimes',
      description: `${props.ids.length} smartphone${props.ids.length > 1 ? 's' : ''} retire${props.ids.length > 1 ? 's' : ''} du stock.`,
      color: 'success'
    })
    open.value = false
    await refreshNuxtData('smartphone-stocks')
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
    :title="`Supprimer ${props.count} smartphone${props.count > 1 ? 's' : ''}`"
    description="Cette action est definitive."
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
