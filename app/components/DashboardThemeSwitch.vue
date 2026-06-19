<script setup lang="ts">
const { dashboardTheme, dashboardThemes, dashboardThemeLabels } = useDashboardTheme()

defineProps<{
  compact?: boolean
  inverse?: boolean
}>()
</script>

<template>
  <div
    class="inline-grid rounded-full p-1"
    :class="inverse ? 'bg-white/10 ring-1 ring-white/10' : 'bg-elevated ring-1 ring-default'"
    :style="{ gridTemplateColumns: `repeat(${dashboardThemes.length}, minmax(0, 1fr))` }"
  >
    <button
      v-for="theme in dashboardThemes"
      :key="theme"
      type="button"
      class="inline-flex items-center justify-center rounded-full font-semibold transition"
      :class="[
        compact ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs',
        dashboardTheme === theme
          ? inverse
            ? 'bg-white text-slate-950 shadow-sm'
            : 'bg-default text-highlighted shadow-sm ring-1 ring-default'
          : inverse
            ? 'text-white/70 hover:text-white'
            : 'text-toned hover:text-highlighted'
      ]"
      @click="dashboardTheme = theme"
    >
      {{ dashboardThemeLabels[theme] }}
    </button>
  </div>
</template>
