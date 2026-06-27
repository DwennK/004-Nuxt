<script setup lang="ts">
const games = [
  {
    value: 'wordle',
    label: 'Mot mystere',
    short: 'Word',
    icon: 'i-lucide-spell-check',
    accent: 'from-emerald-500 to-lime-400',
    description: 'Trouver le mot cache en six essais.'
  },
  {
    value: 'higher',
    label: 'Plus ou moins',
    short: '100',
    icon: 'i-lucide-binary',
    accent: 'from-sky-500 to-cyan-400',
    description: 'Resserrer la plage pour trouver le nombre.'
  },
  {
    value: 'tic',
    label: 'Morpion',
    short: 'X/O',
    icon: 'i-lucide-grid-3x3',
    accent: 'from-amber-500 to-orange-400',
    description: 'Aligner trois symboles avant l IA.'
  },
  {
    value: 'aim',
    label: 'Precision',
    short: 'Aim',
    icon: 'i-lucide-crosshair',
    accent: 'from-rose-500 to-pink-400',
    description: 'Enchainer les cibles avec le moins de rates possible.'
  },
  {
    value: 'reflex',
    label: 'Reflexe',
    short: 'ms',
    icon: 'i-lucide-timer-reset',
    accent: 'from-violet-500 to-fuchsia-400',
    description: 'Attendre le signal et cliquer au bon moment.'
  },
  {
    value: 'snake',
    label: 'Snake',
    short: 'S',
    icon: 'i-lucide-worm',
    accent: 'from-green-500 to-emerald-300',
    description: 'Manger, grandir et eviter les collisions.'
  },
  {
    value: 'tiles',
    label: '2048',
    short: '2k',
    icon: 'i-lucide-layout-grid',
    accent: 'from-orange-500 to-yellow-300',
    description: 'Fusionner les tuiles jusqu au 2048.'
  },
  {
    value: 'connect',
    label: 'Puissance 4',
    short: '4',
    icon: 'i-lucide-circle-dot',
    accent: 'from-red-500 to-yellow-400',
    description: 'Deposer les disques et aligner quatre cases.'
  },
  {
    value: 'mines',
    label: 'Demineur',
    short: 'M',
    icon: 'i-lucide-bomb',
    accent: 'from-zinc-500 to-slate-300',
    description: 'Nettoyer la grille sans declencher de mine.'
  },
  {
    value: 'memory',
    label: 'Memoire',
    short: 'Mem',
    icon: 'i-lucide-brain',
    accent: 'from-indigo-500 to-sky-400',
    description: 'Retrouver toutes les paires.'
  }
]
</script>

<template>
  <UDashboardPanel id="games">
    <template #header>
      <UDashboardNavbar title="Jeux">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UBadge color="primary" variant="subtle">
            {{ games.length }} mini-jeux
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="h-full overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(0,193,106,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_26%)] p-4 md:p-6">
        <div class="mx-auto flex w-full max-w-5xl flex-col gap-3">
          <NuxtLink
            v-for="(game, index) in games"
            :key="game.value"
            :to="`/games/${game.value}`"
            class="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-default bg-default/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-elevated sm:gap-4 sm:p-4"
          >
            <span class="w-6 text-right text-xs font-bold text-toned tabular-nums">
              {{ index + 1 }}
            </span>
            <span class="grid min-w-0 grid-cols-[auto_1fr] items-center gap-3">
              <span
                class="flex size-12 items-center justify-center rounded-md bg-gradient-to-br text-sm font-black text-white shadow-sm sm:size-14"
                :class="game.accent"
              >
                {{ game.short }}
              </span>
              <span class="min-w-0">
                <span class="flex items-center gap-2 text-base font-semibold text-highlighted">
                  <UIcon :name="game.icon" class="size-4 shrink-0 text-primary" />
                  <span class="truncate">{{ game.label }}</span>
                </span>
                <span class="mt-1 block truncate text-sm text-toned">
                  {{ game.description }}
                </span>
              </span>
            </span>
            <span class="flex items-center gap-2 text-sm font-semibold text-primary">
              Jouer
              <UIcon name="i-lucide-arrow-right" class="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </NuxtLink>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
