<script setup lang="ts">
import { arcadeGames } from '#shared/constants/arcade'

definePageMeta({ layout: 'arcade' })
useSeoMeta({ title: 'Arcade · Microwest', description: 'Dix petits jeux pour une grande pause.' })
const categories = ['Tous', 'Réflexes', 'Puzzle', 'Stratégie', 'Mots'] as const
const selectedCategory = ref<string>('Tous')
const search = ref('')
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
const filteredGames = computed(() =>
  arcadeGames.filter(
    game =>
      (selectedCategory.value === 'Tous' || game.category === selectedCategory.value)
      && normalize(`${game.label} ${game.category}`).includes(normalize(search.value))
  )
)
function resetFilters() {
  search.value = ''
  selectedCategory.value = 'Tous'
}

function randomGame() {
  const pool = filteredGames.value.length ? filteredGames.value : arcadeGames
  navigateTo(`/games/${pool[Math.floor(Math.random() * pool.length)]!.value}`)
}
</script>

<template>
  <main class="arcade-lobby">
    <section class="lobby-hero">
      <div class="lobby-intro">
        <span class="arcade-eyebrow"><span class="live-dot" /> MICROWEST ARCADE / 10 JEUX</span>
        <h1>Mode pause.<br><em>Esprit en jeu.</em></h1>
        <p>Un réflexe. Une stratégie. Un nouveau record.<br>Choisis ton terrain de jeu.</p>
        <UButton
          icon="i-lucide-shuffle"
          label="Surprends-moi"
          class="arcade-primary"
          size="lg"
          @click="randomGame"
        />
        <span class="lobby-caption">Quelques secondes ou quelques minutes. À toi de voir.</span>
      </div>
      <NuxtLink to="/games/reflex" class="lobby-feature" style="--game-accent: #d5fb70">
        <div class="feature-top"><span>LE DÉFI DU MOMENT</span><span>01 / 10</span></div>
        <ArcadeArtwork game="reflex" />
        <div class="feature-bottom">
          <div>
            <span>TON PROCHAIN RECORD ?</span>
            <h2>Réflexe</h2>
          </div>
          <span class="feature-play"><UIcon name="i-lucide-arrow-up-right" /></span>
        </div>
      </NuxtLink>
    </section>

    <section class="lobby-library" aria-label="Catalogue des jeux">
      <div class="library-heading">
        <div>
          <span class="arcade-eyebrow">À CHAQUE ENVIE SON JEU</span>
          <h2>Choisis ta prochaine partie<span>.</span></h2>
        </div>
        <span class="library-count">{{ filteredGames.length.toString().padStart(2, '0') }} jeux</span>
      </div>
      <div class="library-toolbar">
        <nav class="arcade-filters" aria-label="Catégorie de jeu">
          <button
            v-for="category in categories"
            :key="category"
            type="button"
            :aria-pressed="selectedCategory === category"
            @click="selectedCategory = category"
          >
            {{ category }}
          </button>
        </nav>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Trouver un jeu…"
          aria-label="Rechercher un jeu"
          class="arcade-search"
        />
      </div>
      <div v-if="filteredGames.length" class="arcade-catalogue">
        <NuxtLink
          v-for="(game, index) in filteredGames"
          :key="game.value"
          :to="`/games/${game.value}`"
          class="arcade-game-card"
          :style="{ '--game-accent': game.accent, '--card-order': Math.min(index, 5) }"
        >
          <div class="game-card-visual">
            <ArcadeArtwork :game="game.value" /><span class="game-card-play"><UIcon name="i-lucide-arrow-up-right" /></span>
          </div>
          <div class="game-card-caption">
            <span>{{ game.category }}<i />{{ game.rhythm }}</span>
            <h3>{{ game.label }}</h3>
            <p>{{ game.description }}</p>
          </div>
        </NuxtLink>
      </div>
      <div v-else class="arcade-empty">
        <UIcon name="i-lucide-search" />
        <h3>Aucun jeu trouvé</h3>
        <p>Essaie un autre nom ou une autre catégorie.</p>
        <UButton
          label="Voir tous les jeux"
          variant="soft"
          @click="resetFilters"
        />
      </div>
    </section>
  </main>
</template>
