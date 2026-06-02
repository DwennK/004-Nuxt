<script setup lang="ts">
const state = reactive<{ [key: string]: boolean }>({
  email: true,
  desktop: false,
  product_updates: true,
  weekly_digest: false,
  important_updates: true
})

const sections = [{
  title: 'Canaux de notification',
  description: 'Où souhaitez-vous recevoir les notifications ?',
  fields: [{
    name: 'email',
    label: 'E-mail',
    description: 'Recevoir un récapitulatif quotidien par e-mail.'
  }, {
    name: 'desktop',
    label: 'Bureau',
    description: 'Recevoir des notifications sur l’ordinateur.'
  }]
}, {
  title: 'Mises à jour du compte',
  description: 'Recevoir les nouvelles liées à l’espace de travail.',
  fields: [{
    name: 'weekly_digest',
    label: 'Récapitulatif hebdomadaire',
    description: 'Recevoir un résumé hebdomadaire des nouveautés.'
  }, {
    name: 'product_updates',
    label: 'Mises à jour produit',
    description: 'Recevoir un e-mail mensuel avec les nouveautés et améliorations.'
  }, {
    name: 'important_updates',
    label: 'Mises à jour importantes',
    description: 'Recevoir les informations importantes comme la sécurité, la maintenance, etc.'
  }]
}]

async function onChange() {
  // TODO: persister les préférences de notifications côté serveur
}
</script>

<template>
  <div v-for="(section, index) in sections" :key="index">
    <UPageCard
      :title="section.title"
      :description="section.description"
      variant="naked"
      class="mb-4"
    />

    <UPageCard variant="subtle" :ui="{ container: 'divide-y divide-default' }">
      <UFormField
        v-for="field in section.fields"
        :key="field.name"
        :name="field.name"
        :label="field.label"
        :description="field.description"
        class="flex items-center justify-between not-last:pb-4 gap-2"
      >
        <USwitch
          v-model="state[field.name]"
          @update:model-value="onChange"
        />
      </UFormField>
    </UPageCard>
  </div>
</template>
