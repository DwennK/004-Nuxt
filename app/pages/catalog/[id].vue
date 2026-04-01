<script setup lang="ts">
const route = useRoute()

await navigateTo({
  path: '/catalog',
  query: {
    edit: Array.isArray(route.params.id) ? route.params.id[0] : String(route.params.id)
  }
}, { replace: true })
</script>
