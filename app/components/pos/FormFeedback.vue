<script setup lang="ts">
defineProps<{
  saving?: boolean
  error?: string | null
}>()
</script>

<template>
  <div aria-live="polite" aria-atomic="true">
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Enregistrement impossible"
      :description="error"
      role="alert"
    />
    <p v-else-if="saving" class="text-sm text-toned" role="status">
      Enregistrement en cours…
    </p>
  </div>
</template>
