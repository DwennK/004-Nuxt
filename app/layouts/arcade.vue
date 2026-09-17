<script setup lang="ts">
import '~/assets/css/arcade.css'
</script>

<template>
  <div class="arcade-shell dark">
    <header class="arcade-topbar">
      <NuxtLink to="/games" class="arcade-brand" aria-label="Microwest Arcade, accueil">
        <span class="brand-mark"><UIcon name="i-lucide-gamepad-2" /></span>
        <span>microwest<span class="brand-divider">/</span><strong>play</strong></span>
      </NuxtLink>
      <div class="arcade-toplinks">
        <span class="arcade-online"><span /> Le temps d’une pause</span>
        <UButton
          to="/"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-up-right"
          label="Retour au POS"
          class="arcade-back"
        />
      </div>
    </header>
    <slot />
    <footer class="arcade-footer">
      <span>MICROWEST · ARCADE</span><span>Juste une dernière partie.</span>
    </footer>
  </div>
</template>
