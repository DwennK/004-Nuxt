<script setup lang="ts">
type GameCategory = 'Mots' | 'Reflexes' | 'Strategie' | 'Puzzle'

const games = [
  {
    value: 'wordle',
    label: 'Mot mystere',
    kicker: 'Deduction',
    icon: 'i-lucide-spell-check',
    category: 'Mots',
    difficulty: 'Calme',
    duration: '2-4 min',
    description: 'Six essais pour lire les indices, eliminer les lettres et trouver le mot.',
    color: 'success',
    surface: 'from-success/18 via-default to-default'
  },
  {
    value: 'higher',
    label: 'Plus ou moins',
    kicker: 'Intervalle',
    icon: 'i-lucide-binary',
    category: 'Puzzle',
    difficulty: 'Rapide',
    duration: '1 min',
    description: 'Resserre la plage en huit coups, avec un feedback immediat apres chaque tentative.',
    color: 'info',
    surface: 'from-info/18 via-default to-default'
  },
  {
    value: 'tic',
    label: 'Morpion',
    kicker: 'Duel IA',
    icon: 'i-lucide-grid-3x3',
    category: 'Strategie',
    difficulty: 'Tactique',
    duration: '1 min',
    description: 'Une IA courte mais defendue: force la ligne avant qu elle ne ferme le plateau.',
    color: 'warning',
    surface: 'from-warning/18 via-default to-default'
  },
  {
    value: 'aim',
    label: 'Precision',
    kicker: 'Aim trainer',
    icon: 'i-lucide-crosshair',
    category: 'Reflexes',
    difficulty: 'Nerveux',
    duration: '30 s',
    description: 'Enchaine quinze cibles, limite les rates et vise un meilleur temps par cible.',
    color: 'error',
    surface: 'from-error/18 via-default to-default'
  },
  {
    value: 'reflex',
    label: 'Reflexe',
    kicker: 'Timing',
    icon: 'i-lucide-timer-reset',
    category: 'Reflexes',
    difficulty: 'Pur',
    duration: '10 s',
    description: 'Attends le signal, evite le faux depart, puis clique au bon millieme.',
    color: 'primary',
    surface: 'from-primary/18 via-default to-default'
  },
  {
    value: 'snake',
    label: 'Snake',
    kicker: 'Arcade',
    icon: 'i-lucide-route',
    category: 'Reflexes',
    difficulty: 'Progressif',
    duration: '3 min',
    description: 'Un classique plus lisible, avec controles clavier et commandes tactiles compactes.',
    color: 'success',
    surface: 'from-success/18 via-default to-default'
  },
  {
    value: 'tiles',
    label: '2048',
    kicker: 'Fusion',
    icon: 'i-lucide-layout-grid',
    category: 'Puzzle',
    difficulty: 'Pose',
    duration: '5 min',
    description: 'Fusionne proprement les tuiles, anticipe le plateau et garde un coin fort.',
    color: 'warning',
    surface: 'from-warning/18 via-default to-default'
  },
  {
    value: 'connect',
    label: 'Puissance 4',
    kicker: 'Alignement',
    icon: 'i-lucide-circle-dot',
    category: 'Strategie',
    difficulty: 'Malin',
    duration: '2 min',
    description: 'L IA cherche les coups gagnants et bloque tes menaces directes.',
    color: 'error',
    surface: 'from-error/18 via-default to-default'
  },
  {
    value: 'mines',
    label: 'Demineur',
    kicker: 'Risque',
    icon: 'i-lucide-bomb',
    category: 'Puzzle',
    difficulty: 'Tendu',
    duration: '4 min',
    description: 'Premier clic protege, drapeaux au clic droit, lecture nette des zones ouvertes.',
    color: 'neutral',
    surface: 'from-elevated via-default to-default'
  },
  {
    value: 'memory',
    label: 'Memoire',
    kicker: 'Observation',
    icon: 'i-lucide-brain',
    category: 'Puzzle',
    difficulty: 'Zen',
    duration: '2 min',
    description: 'Des cartes tech plus claires, un rythme rapide et un meilleur suivi des coups.',
    color: 'info',
    surface: 'from-info/18 via-default to-default'
  }
] satisfies {
  value: string
  label: string
  kicker: string
  icon: string
  category: GameCategory
  difficulty: string
  duration: string
  description: string
  color: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  surface: string
}[]

const categories = ['Tous', 'Reflexes', 'Puzzle', 'Strategie', 'Mots'] as const
const selectedCategory = ref<(typeof categories)[number]>('Tous')
const search = ref('')

const featuredGame = computed(() => games[3]!)

const filteredGames = computed(() => {
  const query = normalize(search.value)

  return games.filter((game) => {
    const matchesCategory = selectedCategory.value === 'Tous' || game.category === selectedCategory.value
    const haystack = normalize(`${game.label} ${game.kicker} ${game.description} ${game.category}`)
    return matchesCategory && (!query || haystack.includes(query))
  })
})

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
</script>

<template>
  <UDashboardPanel id="games">
    <template #header>
      <UDashboardNavbar title="Arcade">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UBadge color="primary" variant="subtle">
            {{ games.length }} jeux jouables
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="h-full overflow-auto bg-muted/30">
        <div class="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
          <section class="overflow-hidden rounded-lg border border-default bg-default shadow-sm">
            <div class="grid min-h-[19rem] lg:grid-cols-[minmax(0,1fr)_25rem]">
              <div class="flex flex-col justify-between gap-8 bg-gradient-to-br from-primary/15 via-default to-info/10 p-5 sm:p-7">
                <div class="max-w-2xl">
                  <UBadge color="primary" variant="subtle" class="mb-4">
                    Pause jouable
                  </UBadge>
                  <h1 class="text-3xl font-black tracking-tight text-highlighted sm:text-4xl">
                    Mini-jeux plus propres, plus nerveux, plus agreables.
                  </h1>
                  <p class="mt-3 max-w-xl text-sm leading-6 text-toned sm:text-base">
                    Une petite arcade interne pour souffler entre deux tickets: jeux rapides, grilles lisibles, controles directs et scores visibles.
                  </p>
                </div>

                <div class="grid gap-2 sm:grid-cols-3">
                  <div class="rounded-lg border border-default/70 bg-default/75 p-3">
                    <p class="text-xs font-semibold uppercase text-toned">
                      Formats
                    </p>
                    <p class="mt-1 text-lg font-black text-highlighted">
                      10 jeux
                    </p>
                  </div>
                  <div class="rounded-lg border border-default/70 bg-default/75 p-3">
                    <p class="text-xs font-semibold uppercase text-toned">
                      Session
                    </p>
                    <p class="mt-1 text-lg font-black text-highlighted">
                      30 s - 5 min
                    </p>
                  </div>
                  <div class="rounded-lg border border-default/70 bg-default/75 p-3">
                    <p class="text-xs font-semibold uppercase text-toned">
                      Controle
                    </p>
                    <p class="mt-1 text-lg font-black text-highlighted">
                      Souris + clavier
                    </p>
                  </div>
                </div>
              </div>

              <NuxtLink
                :to="`/games/${featuredGame.value}`"
                class="group flex flex-col justify-between border-t border-default bg-elevated p-5 transition hover:bg-accented lg:border-l lg:border-t-0"
              >
                <div>
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex size-14 items-center justify-center rounded-lg bg-primary text-inverted shadow-sm">
                      <UIcon :name="featuredGame.icon" class="size-7" />
                    </div>
                    <UBadge :color="featuredGame.color" variant="subtle">
                      Selection
                    </UBadge>
                  </div>
                  <p class="mt-6 text-xs font-bold uppercase text-toned">
                    {{ featuredGame.kicker }}
                  </p>
                  <h2 class="mt-1 text-2xl font-black text-highlighted">
                    {{ featuredGame.label }}
                  </h2>
                  <p class="mt-3 text-sm leading-6 text-toned">
                    {{ featuredGame.description }}
                  </p>
                </div>
                <div class="mt-6 flex items-center justify-between">
                  <div class="flex gap-2">
                    <UBadge color="neutral" variant="outline">
                      {{ featuredGame.duration }}
                    </UBadge>
                    <UBadge color="neutral" variant="outline">
                      {{ featuredGame.difficulty }}
                    </UBadge>
                  </div>
                  <span class="flex items-center gap-1 text-sm font-bold text-primary">
                    Jouer
                    <UIcon name="i-lucide-arrow-right" class="size-4 transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </NuxtLink>
            </div>
          </section>

          <div class="flex flex-col gap-3 rounded-lg border border-default bg-default p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Chercher un jeu"
              class="lg:max-w-sm"
            />
            <div class="flex gap-2 overflow-x-auto">
              <UButton
                v-for="category in categories"
                :key="category"
                :label="category"
                :color="selectedCategory === category ? 'primary' : 'neutral'"
                :variant="selectedCategory === category ? 'solid' : 'outline'"
                size="sm"
                @click="selectedCategory = category"
              />
            </div>
          </div>

          <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <NuxtLink
              v-for="game in filteredGames"
              :key="game.value"
              :to="`/games/${game.value}`"
              class="group overflow-hidden rounded-lg border border-default bg-default shadow-sm transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md"
            >
              <div class="h-1.5 bg-primary" />
              <div class="flex min-h-56 flex-col justify-between bg-gradient-to-br p-4" :class="game.surface">
                <div>
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex size-12 items-center justify-center rounded-lg border border-default/70 bg-default/80 text-primary shadow-sm">
                      <UIcon :name="game.icon" class="size-6" />
                    </div>
                    <UBadge :color="game.color" variant="subtle">
                      {{ game.category }}
                    </UBadge>
                  </div>
                  <p class="mt-4 text-xs font-bold uppercase text-toned">
                    {{ game.kicker }}
                  </p>
                  <h2 class="mt-1 text-xl font-black text-highlighted">
                    {{ game.label }}
                  </h2>
                  <p class="mt-2 line-clamp-3 text-sm leading-6 text-toned">
                    {{ game.description }}
                  </p>
                </div>

                <div class="mt-5 flex items-end justify-between gap-4">
                  <div class="flex flex-wrap gap-2">
                    <UBadge color="neutral" variant="outline">
                      {{ game.duration }}
                    </UBadge>
                    <UBadge color="neutral" variant="outline">
                      {{ game.difficulty }}
                    </UBadge>
                  </div>
                  <span class="flex shrink-0 items-center gap-1 text-sm font-bold text-primary">
                    Lancer
                    <UIcon name="i-lucide-arrow-right" class="size-4 transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </NuxtLink>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
