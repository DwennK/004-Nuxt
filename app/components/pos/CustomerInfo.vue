<script setup lang="ts">
import type { CustomerRecord } from '~~/shared/types/pos'

const props = withDefaults(defineProps<{
  customer: CustomerRecord
  editable?: boolean
  disabled?: boolean
}>(), {
  editable: true,
  disabled: false
})

const emit = defineEmits<{
  edit: []
}>()

const address = computed(() => [
  props.customer.addressLine1,
  props.customer.addressLine2,
  [props.customer.postalCode, props.customer.city].filter(Boolean).join(' ')
].filter(Boolean).join(', '))
</script>

<template>
  <section aria-label="Informations du client" class="min-w-0">
    <div class="mb-2 flex h-8 items-center gap-2 border-b border-default pb-1.5">
      <h2 class="min-w-0 text-xs font-semibold uppercase tracking-wide text-toned">
        Informations du client
      </h2>
      <UTooltip v-if="editable" text="Modifier la fiche client">
        <UButton
          :disabled="disabled"
          type="button"
          icon="i-lucide-pencil"
          aria-label="Modifier la fiche client"
          color="neutral"
          variant="ghost"
          size="xs"
          class="shrink-0"
          @click="emit('edit')"
        />
      </UTooltip>
      <slot name="actions" />
    </div>
    <div class="space-y-0.5 text-xs leading-5">
      <NuxtLink :to="`/customers/${customer.id}`" class="block w-fit max-w-full break-words font-semibold text-highlighted hover:text-primary hover:underline">
        {{ customer.displayName }}
      </NuxtLink>
      <div class="flex min-w-0 items-center gap-2">
        <UIcon name="i-lucide-phone" class="size-3.5 shrink-0 text-muted" />
        <a v-if="customer.phone" :href="`tel:${customer.phone.replace(/[^+\d]/g, '')}`" class="break-all hover:text-primary hover:underline">{{ customer.phone }}</a>
        <span v-else class="text-muted">Téléphone non renseigné</span>
      </div>
      <div class="flex min-w-0 items-center gap-2">
        <UIcon name="i-lucide-mail" class="size-3.5 shrink-0 text-muted" />
        <a v-if="customer.email" :href="`mailto:${customer.email}`" class="break-all hover:text-primary hover:underline">{{ customer.email }}</a>
        <span v-else class="text-muted">Email non renseigné</span>
      </div>
      <div class="flex min-w-0 items-start gap-2">
        <UIcon name="i-lucide-map-pin" class="mt-0.5 size-3.5 shrink-0 text-muted" />
        <address class="min-w-0 break-words not-italic" :class="address ? '' : 'text-muted'">
          {{ address || 'Adresse non renseignée' }}
        </address>
      </div>
    </div>
  </section>
</template>
