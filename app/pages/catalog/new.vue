<script setup lang="ts">
await navigateTo({
  path: '/catalog',
  query: {
    create: '1'
  }
}, { replace: true })
</script>
