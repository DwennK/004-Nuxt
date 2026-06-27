<script setup lang="ts">
const toast = useToast()
const { dashboardTheme, dashboardThemeOptions } = useDashboardTheme()

function selectTheme(theme: typeof dashboardTheme.value) {
  dashboardTheme.value = theme

  toast.add({
    title: 'Thème mis à jour',
    description: `Le thème ${dashboardThemeOptions.find(option => option.value === theme)?.label || ''} est appliqué.`,
    icon: 'i-lucide-check',
    color: 'success'
  })
}
</script>

<template>
  <div>
    <UPageCard
      title="Interface"
      description="Préférences visuelles de l’espace de gestion."
      variant="naked"
      class="mb-4"
    />

    <UPageCard
      title="Thème"
      description="Choisissez l’habillage principal de l’application."
      variant="subtle"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <button
          v-for="option in dashboardThemeOptions"
          :key="option.value"
          type="button"
          class="rounded-md border bg-default p-4 text-left transition hover:bg-muted"
          :class="dashboardTheme === option.value ? 'border-primary ring-2 ring-primary/20' : 'border-default'"
          @click="selectTheme(option.value)"
        >
          <div class="flex items-start gap-3">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-md text-white"
              :style="{ backgroundColor: option.swatch }"
            >
              <UIcon :name="option.icon" class="size-5" />
            </span>

            <span class="min-w-0 flex-1">
              <span class="flex items-center justify-between gap-2">
                <span class="font-medium text-highlighted">{{ option.label }}</span>
                <UIcon
                  v-if="dashboardTheme === option.value"
                  name="i-lucide-check"
                  class="size-4 text-primary"
                />
              </span>
              <span class="mt-1 block text-sm text-toned">
                {{ option.description }}
              </span>
            </span>
          </div>
        </button>
      </div>
    </UPageCard>
  </div>
</template>
