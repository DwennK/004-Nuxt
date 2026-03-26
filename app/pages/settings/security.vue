<script setup lang="ts">
import * as z from 'zod'
import type { FormError } from '@nuxt/ui'

const passwordSchema = z.object({
  current: z.string().min(8, 'Minimum 8 caractères'),
  new: z.string().min(8, 'Minimum 8 caractères')
})

type PasswordSchema = z.output<typeof passwordSchema>

const password = reactive<Partial<PasswordSchema>>({
  current: '',
  new: ''
})

const validate = (state: Partial<PasswordSchema>): FormError[] => {
  const errors: FormError[] = []
  if (state.current && state.new && state.current === state.new) {
    errors.push({ name: 'new', message: 'Le nouveau mot de passe doit être différent' })
  }
  return errors
}
</script>

<template>
  <UPageCard
    title="Mot de passe"
    description="Confirmez votre mot de passe actuel avant d’en définir un nouveau."
    variant="subtle"
  >
    <UForm
      :schema="passwordSchema"
      :state="password"
      :validate="validate"
      class="flex flex-col gap-4 max-w-xs"
    >
      <UFormField name="current">
        <UInput
          v-model="password.current"
          type="password"
          placeholder="Mot de passe actuel"
          class="w-full"
        />
      </UFormField>

      <UFormField name="new">
        <UInput
          v-model="password.new"
          type="password"
          placeholder="Nouveau mot de passe"
          class="w-full"
        />
      </UFormField>

      <UButton label="Mettre à jour" class="w-fit" type="submit" />
    </UForm>
  </UPageCard>

  <UPageCard
    title="Compte"
    description="Si vous ne souhaitez plus utiliser le service, vous pouvez supprimer votre compte ici. Cette action est irréversible et toutes les données liées seront supprimées définitivement."
    class="bg-gradient-to-tl from-error/10 from-5% to-default"
  >
    <template #footer>
      <UButton label="Supprimer le compte" color="error" />
    </template>
  </UPageCard>
</template>
