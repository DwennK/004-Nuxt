<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  layout: false,
  auth: false
})

const schema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis')
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  email: '',
  password: ''
})

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const route = useRoute()
const { fetch: refreshSession } = useUserSession()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  errorMessage.value = null
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: event.data
    })
    await refreshSession()
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await navigateTo(redirect)
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    errorMessage.value = statusCode === 401
      ? 'Email ou mot de passe incorrect.'
      : 'Connexion impossible. Réessayez.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-elevated/20 p-6">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="flex flex-col items-center gap-2">
          <AppLogo class="h-8 w-auto" />
          <h1 class="text-lg font-semibold">
            Connexion
          </h1>
        </div>
      </template>

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Email"
          name="email"
          required
        >
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="email"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Mot de passe"
          name="password"
          required
        >
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          :title="errorMessage"
        />

        <UButton
          type="submit"
          block
          :loading="loading"
        >
          Se connecter
        </UButton>
      </UForm>
    </UCard>
  </div>
</template>
