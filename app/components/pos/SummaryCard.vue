<script setup lang="ts">
defineProps<{
  title: string
  value: string
  description?: string
  icon?: string
}>()
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-4' }">
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-1">
        <p class="text-sm font-medium text-muted">
          {{ title }}
        </p>
        <p class="text-2xl font-semibold tabular-nums text-highlighted">
          {{ value }}
        </p>
        <p v-if="description" class="text-xs text-toned">
          {{ description }}
        </p>
      </div>

      <div
        v-if="icon"
        class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary"
      >
        <UIcon :name="icon" class="size-4" />
      </div>
    </div>
  </UCard>
</template>
