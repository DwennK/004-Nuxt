<script setup lang="ts">
const open = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('file-input')
const selectedFile = ref<File | null>(null)
const importing = ref(false)
const toast = useToast()

function triggerFilePicker() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  selectedFile.value = target.files?.[0] || null
}

function resetState() {
  selectedFile.value = null

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

async function onImport() {
  if (!selectedFile.value) {
    toast.add({
      title: 'Erreur',
      description: 'Sélectionnez un fichier CSV avant de lancer l’import.',
      color: 'error'
    })
    return
  }

  importing.value = true

  try {
    const content = await selectedFile.value.text()
    const response = await $fetch<{ imported: number }>('/api/smartphone-reservations/import', {
      method: 'POST',
      body: { content }
    })

    toast.add({
      title: 'Import terminé',
      description: `${response.imported} demande${response.imported > 1 ? 's' : ''} importée${response.imported > 1 ? 's' : ''}.`,
      color: 'success'
    })
    open.value = false
    resetState()
    await refreshNuxtData('smartphone-reservation-requests')
  } catch (error) {
    toast.add({
      title: 'Erreur',
      description: error instanceof Error ? error.message : 'Import impossible',
      color: 'error'
    })
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Importer un CSV"
    description="Import de demandes de réservation smartphone depuis un fichier CSV."
  >
    <UButton
      label="Importer CSV"
      icon="i-lucide-file-up"
      color="neutral"
      variant="outline"
    />

    <template #body>
      <div class="space-y-4">
        <div class="rounded-lg border border-default bg-elevated/50 p-4 text-sm text-toned">
          Colonnes attendues :
          <div class="mt-2 font-mono text-xs text-muted">
            Nom;Téléphone;Modèle;Stockage;DateDemande;État;Remarques
          </div>
          <div class="mt-2 text-xs text-muted">
            Formats acceptés : `,` ou `;` comme séparateur, date en `YYYY-MM-DD`, état `En attente`, `Contacté` ou `Vendu`.
          </div>
        </div>

        <input
          ref="file-input"
          type="file"
          accept=".csv,text/csv"
          class="hidden"
          @change="onFileChange"
        >

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="Choisir un fichier"
            icon="i-lucide-folder-open"
            color="neutral"
            variant="subtle"
            @click="triggerFilePicker"
          />

          <span class="text-sm text-muted">
            {{ selectedFile?.name || 'Aucun fichier sélectionné' }}
          </span>
        </div>

        <div class="flex justify-end gap-2">
          <UButton
            label="Annuler"
            color="neutral"
            variant="subtle"
            @click="open = false"
          />
          <UButton
            label="Importer"
            icon="i-lucide-upload"
            :loading="importing"
            @click="onImport"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
