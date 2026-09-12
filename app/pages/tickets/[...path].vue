<script setup lang="ts">
definePageMeta({
  redirect: to => ({
    path: to.path.replace(/^\/tickets(?=\/|$)/, '/dossiers'),
    query: to.query,
    hash: to.hash
  })
})
</script>

<template>
  <div />
</template>
