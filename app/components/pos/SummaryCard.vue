<script setup lang="ts">
defineProps<{
  title: string
  value: string
  description?: string
  icon?: string
}>()
</script>

<template>
  <UCard :ui="{ body: 'p-5' }">
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <p class="text-sm font-medium text-muted">
          {{ title }}
        </p>
        <p class="text-2xl font-semibold text-highlighted">
          {{ value }}
        </p>
        <p v-if="description" class="text-sm text-toned">
          {{ description }}
        </p>
      </div>

      <div
        v-if="icon"
        class="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring ring-primary/20"
      >
        <UIcon :name="icon" class="size-5" />
      </div>
    </div>
  </UCard>
</template>
