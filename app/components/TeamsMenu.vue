<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()
</script>

<template>
  <UButton
    to="/comptoir"
    color="neutral"
    variant="ghost"
    block
    :square="collapsed"
    :label="collapsed ? undefined : 'Microwest POS'"
    icon="i-lucide-store"
    class="outlook-brand"
    :class="[!collapsed && 'justify-start py-1.5']"
    :ui="{
      leadingIcon: 'text-white'
    }"
  />
</template>
