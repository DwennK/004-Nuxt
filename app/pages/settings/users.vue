<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { UserRecord } from '~~/shared/types/users'
import {
  createUserSchema,
  changePasswordSchema
} from '~~/shared/validation/users'

const toast = useToast()
const { user: sessionUser } = useUserSession()

const { data: users, refresh, pending } = await useFetch<UserRecord[]>(
  '/api/settings/users',
  { default: () => [], key: 'settings-users' }
)

const q = ref('')

const filteredUsers = computed(() => {
  const needle = q.value.trim().toLowerCase()
  if (!needle) return users.value
  return users.value.filter(u =>
    u.email.toLowerCase().includes(needle)
    || u.name.toLowerCase().includes(needle)
  )
})

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
})

function formatDate(value: string) {
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return value
  return dateFormatter.format(d)
}

function isSelf(user: UserRecord) {
  return sessionUser.value?.id === user.id
}

// Create modal
const createOpen = ref(false)
const createState = reactive({ email: '', name: '', password: '', isAdmin: false })
const createSchema = createUserSchema

function resetCreate() {
  createState.email = ''
  createState.name = ''
  createState.password = ''
  createState.isAdmin = false
}

async function onCreateSubmit(event: FormSubmitEvent<z.output<typeof createSchema>>) {
  try {
    await $fetch('/api/settings/users', {
      method: 'POST',
      body: event.data
    })
    toast.add({
      title: 'Compte créé',
      description: `${event.data.email} a été ajouté.`,
      color: 'success',
      icon: 'i-lucide-check'
    })
    createOpen.value = false
    resetCreate()
    await refresh()
  } catch (error) {
    toast.add({
      title: 'Création impossible',
      description: error instanceof Error ? error.message : 'Erreur inconnue',
      color: 'error'
    })
  }
}

// Edit modal
const editOpen = ref(false)
const editTarget = ref<UserRecord | null>(null)
const editState = reactive({ email: '', name: '', isActive: true, isAdmin: false })
const editSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email invalide'),
  name: z.string().trim().min(1, 'Nom requis').max(120, 'Nom trop long'),
  isActive: z.boolean(),
  isAdmin: z.boolean()
})

function openEdit(user: UserRecord) {
  editTarget.value = user
  editState.email = user.email
  editState.name = user.name
  editState.isActive = user.isActive
  editState.isAdmin = user.isAdmin
  editOpen.value = true
}

async function onEditSubmit(event: FormSubmitEvent<z.output<typeof editSchema>>) {
  if (!editTarget.value) return
  try {
    const body: Record<string, unknown> = {}
    if (event.data.email !== editTarget.value.email) body.email = event.data.email
    if (event.data.name !== editTarget.value.name) body.name = event.data.name
    if (event.data.isActive !== editTarget.value.isActive) body.isActive = event.data.isActive
    if (event.data.isAdmin !== editTarget.value.isAdmin) body.isAdmin = event.data.isAdmin
    if (Object.keys(body).length === 0) {
      editOpen.value = false
      return
    }
    await $fetch(`/api/settings/users/${editTarget.value.id}`, {
      method: 'PATCH',
      body
    })
    toast.add({
      title: 'Compte mis à jour',
      color: 'success',
      icon: 'i-lucide-check'
    })
    editOpen.value = false
    await refresh()
  } catch (error) {
    toast.add({
      title: 'Mise à jour impossible',
      description: error instanceof Error ? error.message : 'Erreur inconnue',
      color: 'error'
    })
  }
}

// Password modal
const passwordOpen = ref(false)
const passwordTarget = ref<UserRecord | null>(null)
const passwordState = reactive({ password: '' })

function openPassword(user: UserRecord) {
  passwordTarget.value = user
  passwordState.password = ''
  passwordOpen.value = true
}

async function onPasswordSubmit(event: FormSubmitEvent<z.output<typeof changePasswordSchema>>) {
  if (!passwordTarget.value) return
  try {
    await $fetch(`/api/settings/users/${passwordTarget.value.id}/password`, {
      method: 'POST',
      body: event.data
    })
    toast.add({
      title: 'Mot de passe changé',
      color: 'success',
      icon: 'i-lucide-check'
    })
    passwordOpen.value = false
    passwordState.password = ''
  } catch (error) {
    toast.add({
      title: 'Changement impossible',
      description: error instanceof Error ? error.message : 'Erreur inconnue',
      color: 'error'
    })
  }
}

// Delete modal
const deleteOpen = ref(false)
const deleteTarget = ref<UserRecord | null>(null)

function openDelete(user: UserRecord) {
  deleteTarget.value = user
  deleteOpen.value = true
}

async function onDeleteConfirm() {
  if (!deleteTarget.value) return
  try {
    await $fetch(`/api/settings/users/${deleteTarget.value.id}`, {
      method: 'DELETE'
    })
    toast.add({
      title: 'Compte supprimé',
      color: 'success',
      icon: 'i-lucide-check'
    })
    deleteOpen.value = false
    await refresh()
  } catch (error) {
    toast.add({
      title: 'Suppression impossible',
      description: error instanceof Error ? error.message : 'Erreur inconnue',
      color: 'error'
    })
  }
}
</script>

<template>
  <div>
    <UPageCard
      title="Utilisateurs"
      description="Comptes ayant accès à l’application. Un compte désactivé ne peut plus se connecter."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        label="Nouveau compte"
        icon="i-lucide-plus"
        color="neutral"
        class="w-fit lg:ms-auto"
        @click="createOpen = true"
      />
    </UPageCard>

    <UPageCard
      variant="subtle"
      :ui="{ container: 'p-0 sm:p-0 gap-y-0', wrapper: 'items-stretch', header: 'p-4 mb-0 border-b border-default' }"
    >
      <template #header>
        <UInput
          v-model="q"
          icon="i-lucide-search"
          placeholder="Rechercher un utilisateur"
          class="w-full"
        />
      </template>

      <div v-if="pending && users.length === 0" class="p-8 text-center text-sm text-muted">
        Chargement…
      </div>

      <UEmpty
        v-else-if="filteredUsers.length === 0"
        class="py-8"
        icon="i-lucide-users"
        :title="q ? 'Aucun résultat' : 'Aucun utilisateur'"
        :description="q ? 'Aucun compte ne correspond à votre recherche.' : 'Créez un premier compte pour commencer.'"
      />

      <ul v-else role="list" class="divide-y divide-default">
        <li
          v-for="user in filteredUsers"
          :key="user.id"
          class="flex items-center justify-between gap-3 py-3 px-4 sm:px-6"
        >
          <div class="flex items-center gap-3 min-w-0">
            <UAvatar
              :alt="user.name"
              size="md"
              icon="i-lucide-user"
            />

            <div class="text-sm min-w-0">
              <p class="text-highlighted font-medium truncate flex items-center gap-2">
                {{ user.name }}
                <UBadge
                  v-if="isSelf(user)"
                  label="Vous"
                  color="primary"
                  variant="subtle"
                  size="sm"
                />
                <UBadge
                  v-if="user.isAdmin"
                  label="Admin"
                  color="warning"
                  variant="subtle"
                  size="sm"
                />
              </p>
              <p class="text-muted truncate">
                {{ user.email }}
              </p>
              <p class="text-xs text-toned">
                Créé le {{ formatDate(user.createdAt) }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <UBadge
              :label="user.isActive ? 'Actif' : 'Désactivé'"
              :color="user.isActive ? 'success' : 'neutral'"
              variant="subtle"
            />

            <UDropdownMenu
              :items="[
                { label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => openEdit(user) },
                { label: 'Changer mot de passe', icon: 'i-lucide-key-round', onSelect: () => openPassword(user) },
                { label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error' as const, disabled: isSelf(user), onSelect: () => openDelete(user) }
              ]"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
              />
            </UDropdownMenu>
          </div>
        </li>
      </ul>
    </UPageCard>

    <!-- Create -->
    <UModal
      v-model:open="createOpen"
      title="Nouveau compte"
      description="Ce compte pourra se connecter à l’application avec l’email et le mot de passe ci-dessous."
    >
      <template #body>
        <UForm
          id="users-create"
          :schema="createSchema"
          :state="createState"
          class="space-y-4"
          @submit="onCreateSubmit"
        >
          <UFormField name="email" label="Email" required>
            <UInput
              v-model="createState.email"
              type="email"
              autocomplete="off"
              class="w-full"
            />
          </UFormField>
          <UFormField name="name" label="Nom" required>
            <UInput
              v-model="createState.name"
              autocomplete="off"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="password"
            label="Mot de passe"
            required
            help="8 caractères minimum."
          >
            <UInput
              v-model="createState.password"
              type="password"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>
          <UFormField name="isAdmin" label="Administrateur">
            <USwitch v-model="createState.isAdmin" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            label="Annuler"
            color="neutral"
            variant="subtle"
            @click="createOpen = false"
          />
          <UButton
            form="users-create"
            label="Créer"
            color="neutral"
            type="submit"
            loading-auto
          />
        </div>
      </template>
    </UModal>

    <!-- Edit -->
    <UModal
      v-model:open="editOpen"
      title="Modifier l’utilisateur"
    >
      <template #body>
        <UForm
          id="users-edit"
          :schema="editSchema"
          :state="editState"
          class="space-y-4"
          @submit="onEditSubmit"
        >
          <UFormField name="email" label="Email" required>
            <UInput v-model="editState.email" type="email" class="w-full" />
          </UFormField>
          <UFormField name="name" label="Nom" required>
            <UInput v-model="editState.name" class="w-full" />
          </UFormField>
          <UFormField name="isActive" label="Compte actif">
            <USwitch
              v-model="editState.isActive"
              :disabled="editTarget ? isSelf(editTarget) : false"
            />
            <template v-if="editTarget && isSelf(editTarget)" #help>
              Vous ne pouvez pas désactiver votre propre compte.
            </template>
          </UFormField>
          <UFormField name="isAdmin" label="Administrateur">
            <USwitch
              v-model="editState.isAdmin"
              :disabled="editTarget ? isSelf(editTarget) : false"
            />
            <template v-if="editTarget && isSelf(editTarget)" #help>
              Vous ne pouvez pas retirer vos propres droits administrateur.
            </template>
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            label="Annuler"
            color="neutral"
            variant="subtle"
            @click="editOpen = false"
          />
          <UButton
            form="users-edit"
            label="Enregistrer"
            color="neutral"
            type="submit"
            loading-auto
          />
        </div>
      </template>
    </UModal>

    <!-- Password -->
    <UModal
      v-model:open="passwordOpen"
      :title="passwordTarget ? `Changer le mot de passe de ${passwordTarget.name}` : 'Changer le mot de passe'"
      description="L’ancien mot de passe ne sera plus utilisable."
    >
      <template #body>
        <UForm
          id="users-password"
          :schema="changePasswordSchema"
          :state="passwordState"
          class="space-y-4"
          @submit="onPasswordSubmit"
        >
          <UFormField
            name="password"
            label="Nouveau mot de passe"
            required
            help="8 caractères minimum."
          >
            <UInput
              v-model="passwordState.password"
              type="password"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            label="Annuler"
            color="neutral"
            variant="subtle"
            @click="passwordOpen = false"
          />
          <UButton
            form="users-password"
            label="Mettre à jour"
            color="neutral"
            type="submit"
            loading-auto
          />
        </div>
      </template>
    </UModal>

    <!-- Delete -->
    <UModal
      v-model:open="deleteOpen"
      :title="deleteTarget ? `Supprimer ${deleteTarget.name} ?` : 'Supprimer'"
      description="Cette action est définitive."
    >
      <template #body>
        <p class="text-sm text-muted">
          Le compte <span class="font-medium text-highlighted">{{ deleteTarget?.email }}</span> ne pourra plus se connecter. Pour simplement suspendre l’accès, préférez la désactivation.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            label="Annuler"
            color="neutral"
            variant="subtle"
            @click="deleteOpen = false"
          />
          <UButton
            label="Supprimer"
            color="error"
            variant="solid"
            loading-auto
            @click="onDeleteConfirm"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
