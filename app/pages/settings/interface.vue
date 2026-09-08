<script setup lang="ts">
const toast = useToast()
const colorMode = useColorMode()
const { dashboardTheme, dashboardThemeOptions } = useDashboardTheme()

const appearanceOptions = [
  { value: 'light', label: 'Clair', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Sombre', icon: 'i-lucide-moon' },
  { value: 'system', label: 'Système', icon: 'i-lucide-monitor' }
]

function selectTheme(theme: typeof dashboardTheme.value) {
  if (dashboardTheme.value === theme) return
  dashboardTheme.value = theme

  toast.add({
    title: `Thème ${dashboardThemeOptions.find(option => option.value === theme)?.label} appliqué`,
    icon: 'i-lucide-check',
    color: 'success'
  })
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold text-highlighted">
          Votre espace de travail
        </h2>
        <p class="mt-1 text-sm text-toned">
          L’esprit Office, avec le confort de lecture du POS.
        </p>
      </div>
      <ClientOnly>
        <div class="flex gap-1 rounded-lg border border-default bg-elevated p-1" role="group" aria-label="Apparence">
          <UButton
            v-for="option in appearanceOptions"
            :key="option.value"
            :label="option.label"
            :icon="option.icon"
            color="neutral"
            :variant="colorMode.preference === option.value ? 'outline' : 'ghost'"
            :aria-pressed="colorMode.preference === option.value"
            size="sm"
            @click="colorMode.preference = option.value"
          />
        </div>
      </ClientOnly>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Thème Office">
      <button
        v-for="option in dashboardThemeOptions"
        :key="option.value"
        type="button"
        class="office-theme-choice group flex flex-col overflow-hidden rounded-lg text-left transition hover:-translate-y-0.5 motion-reduce:transform-none"
        :style="{ '--office-swatch': option.swatch }"
        :aria-pressed="dashboardTheme === option.value"
        :aria-label="`Thème ${option.label}`"
        @click="selectTheme(option.value)"
      >
        <div class="flex w-full items-center gap-2 px-4 py-3 text-white" :style="{ background: option.swatch }">
          <UIcon :name="option.icon" class="size-5" />
          <span class="font-semibold">{{ option.label }}</span>
          <UIcon v-if="dashboardTheme === option.value" name="i-lucide-check" class="ml-auto size-5" />
        </div>

        <div class="w-full p-4">
          <p class="min-h-10 text-sm text-toned">
            {{ option.description }}
          </p>
          <div aria-hidden="true" class="mt-4 overflow-hidden rounded border border-default bg-muted p-2.5">
            <div class="mb-2 flex items-center gap-1 border-b border-default pb-2 text-[10px] font-medium text-toned">
              <span class="rounded-sm bg-default px-2 py-1 shadow-xs" :style="{ borderBottom: `2px solid ${option.swatch}` }">Accueil</span>
              <span class="px-2">Documents</span>
            </div>
            <div class="overflow-hidden rounded-sm border border-default bg-default text-[10px]">
              <div class="grid grid-cols-[1fr_auto] bg-elevated px-2 py-1 font-semibold text-highlighted">
                <span>Dossier</span><span>Statut</span>
              </div>
              <div class="flex items-center justify-between border-t border-default px-2 py-1.5 text-toned">
                <span>Remplacement écran</span><span class="size-1.5 rounded-full" :style="{ background: option.swatch }" />
              </div>
              <div class="border-t border-default px-2 py-1.5 text-toned">
                Diagnostic ordinateur
              </div>
            </div>
          </div>
        </div>
      </button>
    </div>
    <p class="text-xs text-muted">
      Le thème et l’apparence sont mémorisés sur ce navigateur. Les couleurs des statuts restent identiques.
    </p>
  </div>
</template>
