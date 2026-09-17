<script setup lang="ts">
import type { ArcadeGameId } from '#shared/constants/arcade'

defineProps<{ game: ArcadeGameId }>()
const snake = [40, 41, 42, 43, 44, 32, 20, 21, 22, 23, 35, 47, 59, 58, 57]
</script>

<template>
  <div class="arcade-art" :class="`art-${game}`" aria-hidden="true">
    <template v-if="game === 'reflex'">
      <div class="art-orbit orbit-one" />
      <div class="art-orbit orbit-two" />
      <div class="art-orbit orbit-three" />
      <div class="art-signal">
        <UIcon name="i-lucide-zap" />
      </div>
      <span class="art-time">0.218<span>sec</span></span>
    </template>
    <div v-else-if="game === 'wordle'" class="art-words">
      <span v-for="(letter, i) in 'JOUER'" :key="i" :class="`letter-${i}`">{{ letter }}</span>
    </div>
    <div v-else-if="game === 'higher'" class="art-number">
      <span>↑</span>42<span>↓</span><i />
    </div>
    <div v-else-if="game === 'tic'" class="art-tic">
      <span
        v-for="(mark, i) in ['×', '', '○', '', '×', '', '○', '', '×']"
        :key="i"
        :class="{ 'art-lit': mark === '×' }"
      >{{ mark }}</span>
    </div>
    <template v-else-if="game === 'aim'">
      <div class="art-target target-one">
        <i />
      </div>
      <div class="art-target target-two">
        <i />
      </div>
      <div class="art-target target-three">
        <i />
      </div>
      <span class="art-crosshair">+</span>
    </template>
    <div v-else-if="game === 'snake'" class="art-snake">
      <span
        v-for="i in 84"
        :key="i"
        :class="{ 'art-body': snake.includes(i), 'art-head': i === 57, 'art-fruit': i === 62 }"
      />
    </div>
    <div v-else-if="game === 'tiles'" class="art-tiles">
      <span v-for="(n, i) in [2, 4, 8, 16, 32, 64, 128, 256, 2048]" :key="i" :style="{ opacity: 0.4 + i * 0.075 }">{{
        n
      }}</span>
    </div>
    <div v-else-if="game === 'connect'" class="art-connect">
      <span
        v-for="i in 35"
        :key="i"
        :class="{ 'art-disc': [16, 22, 28, 34].includes(i), 'art-opponent': [21, 23, 29, 30, 35].includes(i) }"
      />
    </div>
    <div v-else-if="game === 'mines'" class="art-mines">
      <span
        v-for="(n, i) in ['', '', '⚑', '', '', '1', '2', '', '', '1', '', '', '', '', '2', '']"
        :key="i"
        :class="{ 'art-open': n && n !== '⚑' }"
      >{{ n }}</span>
    </div>
    <div v-else class="art-memory">
      <span
        v-for="(icon, i) in ['i-lucide-cpu', 'i-lucide-sparkles', 'i-lucide-sparkles', 'i-lucide-cpu']"
        :key="i"
        :class="{ 'art-pair': i === 0 || i === 3 }"
      ><UIcon :name="icon" /></span>
    </div>
  </div>
</template>
