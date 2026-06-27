<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui'
import type {
  MobileSentrixCategoriesResponse,
  MobileSentrixCategorySummary,
  MobileSentrixOAuthExchangeResponse,
  MobileSentrixProductsResponse,
  MobileSentrixProductSummary,
  MobileSentrixSearchResponse,
  MobileSentrixStatusResponse
} from '~~/shared/types/pos'

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const route = useRoute()
const toast = useToast()

const searchTerm = ref('iphone lcd')
const searchLimit = ref(20)
const searchStartIndex = ref(0)
const productSku = ref('')
const categoryId = ref('')
const devicePage = ref(1)
const deviceLimit = ref(20)
const copiedEnv = ref(false)
const oauthExchangePending = ref(false)
const searchPending = ref(false)
const productsPending = ref(false)
const devicesPending = ref(false)
const categoriesPending = ref(false)
const searchResult = ref<MobileSentrixSearchResponse | null>(null)
const productsResult = ref<MobileSentrixProductsResponse | null>(null)
const devicesResult = ref<MobileSentrixProductsResponse | null>(null)
const categoriesResult = ref<MobileSentrixCategoriesResponse | null>(null)
const oauthResult = ref<MobileSentrixOAuthExchangeResponse | null>(null)
const oauthExchangeError = ref<string | null>(null)

const { data: status, refresh: refreshStatus } = await useFetch<MobileSentrixStatusResponse>('/api/tools/mobilesentrix/status')

const oauthToken = computed(() => typeof route.query.oauth_token === 'string' ? route.query.oauth_token : '')
const oauthVerifier = computed(() => typeof route.query.oauth_verifier === 'string' ? route.query.oauth_verifier : '')
const hasOauthCallback = computed(() => Boolean(oauthToken.value && oauthVerifier.value))
const canUseApi = computed(() => Boolean(status.value?.readyForApi))
const shouldShowOauthReturn = computed(() => !canUseApi.value && (hasOauthCallback.value || oauthResult.value))
const browserExchangePath = computed(() => {
  if (!hasOauthCallback.value) {
    return null
  }

  return `/api/tools/mobilesentrix/oauth/browser-exchange?oauthToken=${encodeURIComponent(oauthToken.value)}&oauthVerifier=${encodeURIComponent(oauthVerifier.value)}`
})

const tabs = [{
  label: 'Recherche',
  icon: 'i-lucide-search',
  slot: 'search'
}, {
  label: 'Appareils',
  icon: 'i-lucide-smartphone',
  slot: 'devices'
}, {
  label: 'Catégories',
  icon: 'i-lucide-list-tree',
  slot: 'categories'
}] satisfies TabsItem[]

function getFetchErrorMessage(fetchError: unknown, fallback: string) {
  if (!fetchError || typeof fetchError !== 'object') {
    return fallback
  }

  if ('data' in fetchError && fetchError.data && typeof fetchError.data === 'object') {
    const data = fetchError.data

    if ('message' in data && typeof data.message === 'string' && data.message.trim()) {
      return data.message
    }

    const statusMessage = 'statusMessage' in data ? data.statusMessage : null

    if (typeof statusMessage === 'string' && statusMessage.trim()) {
      return statusMessage
    }
  }

  if ('statusMessage' in fetchError && typeof fetchError.statusMessage === 'string' && fetchError.statusMessage.trim()) {
    return fetchError.statusMessage
  }

  if ('message' in fetchError && typeof fetchError.message === 'string' && fetchError.message.trim()) {
    return fetchError.message
  }

  return fallback
}

function formatMobileSentrixPrice(value: number | null) {
  if (value === null) {
    return '—'
  }

  return new Intl.NumberFormat('fr-CH', {
    style: 'currency',
    currency: 'USD'
  }).format(value)
}

function getStockBadge(product: MobileSentrixProductSummary) {
  if (product.inStock === null) {
    return {
      label: 'Inconnu',
      color: 'neutral' as const
    }
  }

  return product.inStock
    ? { label: 'En stock', color: 'success' as const }
    : { label: 'Rupture', color: 'error' as const }
}

async function exchangeOAuthToken() {
  if (!hasOauthCallback.value) {
    return
  }

  oauthExchangePending.value = true
  oauthExchangeError.value = null

  try {
    oauthResult.value = await $fetch<MobileSentrixOAuthExchangeResponse>('/api/tools/mobilesentrix/oauth/exchange', {
      method: 'POST',
      body: {
        oauthToken: oauthToken.value,
        oauthVerifier: oauthVerifier.value
      }
    })

    toast.add({
      title: 'Tokens MobileSentrix générés',
      description: 'Ajoutez-les dans .env puis redémarrez Nuxt.',
      color: 'success'
    })
  } catch (fetchError) {
    oauthExchangeError.value = getFetchErrorMessage(fetchError, 'MobileSentrix n’a pas pu générer les tokens.')

    toast.add({
      title: 'Connexion MobileSentrix impossible',
      description: oauthExchangeError.value,
      color: 'error'
    })
  } finally {
    oauthExchangePending.value = false
  }
}

async function copyEnvTokens() {
  if (!oauthResult.value || typeof navigator === 'undefined') {
    return
  }

  await navigator.clipboard.writeText([
    `MOBILESENTRIX_ACCESS_TOKEN=${oauthResult.value.accessToken}`,
    `MOBILESENTRIX_ACCESS_TOKEN_SECRET=${oauthResult.value.accessTokenSecret}`
  ].join('\n'))
  copiedEnv.value = true
}

async function searchProducts() {
  const q = searchTerm.value.trim()

  if (q.length < 2) {
    toast.add({
      title: 'Recherche trop courte',
      description: 'Saisissez au moins 2 caractères.',
      color: 'warning'
    })
    return
  }

  searchPending.value = true

  try {
    searchResult.value = await $fetch<MobileSentrixSearchResponse>('/api/tools/mobilesentrix/search', {
      query: {
        q,
        maxResults: searchLimit.value,
        startIndex: searchStartIndex.value
      }
    })
  } catch (fetchError) {
    toast.add({
      title: 'Recherche impossible',
      description: getFetchErrorMessage(fetchError, 'MobileSentrix n’a pas répondu à la recherche.'),
      color: 'error'
    })
  } finally {
    searchPending.value = false
  }
}

async function loadProducts() {
  productsPending.value = true

  try {
    productsResult.value = await $fetch<MobileSentrixProductsResponse>('/api/tools/mobilesentrix/products', {
      query: {
        sku: productSku.value || undefined,
        categoryId: categoryId.value || undefined,
        limit: 20,
        page: 1
      }
    })
  } catch (fetchError) {
    toast.add({
      title: 'Produits indisponibles',
      description: getFetchErrorMessage(fetchError, 'Impossible de charger les produits MobileSentrix.'),
      color: 'error'
    })
  } finally {
    productsPending.value = false
  }
}

async function loadDevices() {
  devicesPending.value = true

  try {
    devicesResult.value = await $fetch<MobileSentrixProductsResponse>('/api/tools/mobilesentrix/products', {
      query: {
        deviceProducts: true,
        page: devicePage.value,
        limit: deviceLimit.value
      }
    })
  } catch (fetchError) {
    toast.add({
      title: 'Appareils indisponibles',
      description: getFetchErrorMessage(fetchError, 'Impossible de charger les appareils MobileSentrix.'),
      color: 'error'
    })
  } finally {
    devicesPending.value = false
  }
}

async function loadCategories() {
  categoriesPending.value = true

  try {
    categoriesResult.value = await $fetch<MobileSentrixCategoriesResponse>('/api/tools/mobilesentrix/categories')
  } catch (fetchError) {
    toast.add({
      title: 'Catégories indisponibles',
      description: getFetchErrorMessage(fetchError, 'Impossible de charger les catégories MobileSentrix.'),
      color: 'error'
    })
  } finally {
    categoriesPending.value = false
  }
}

const productColumns: TableColumn<MobileSentrixProductSummary>[] = [
  {
    accessorKey: 'name',
    header: 'Produit',
    cell: ({ row }) => h('div', { class: 'flex min-w-0 items-center gap-3' }, [
      row.original.imageUrl
        ? h('img', {
            src: row.original.imageUrl,
            alt: '',
            class: 'size-11 shrink-0 rounded-md border border-default object-cover'
          })
        : h('div', { class: 'flex size-11 shrink-0 items-center justify-center rounded-md border border-default bg-elevated text-toned' }, [
            h('span', { class: 'i-lucide-package size-5' })
          ]),
      h('div', { class: 'min-w-0 leading-tight' }, [
        h('p', { class: 'truncate font-medium text-highlighted' }, row.original.name),
        h('p', { class: 'truncate text-xs text-toned' }, [
          row.original.sku || 'SKU inconnu',
          row.original.model ? ` · ${row.original.model}` : '',
          row.original.frontPosition ? ` · ${row.original.frontPosition}` : ''
        ].join(''))
      ])
    ])
  },
  {
    accessorKey: 'price',
    header: 'Prix',
    cell: ({ row }) => h('span', { class: 'font-medium text-highlighted' }, formatMobileSentrixPrice(row.original.price))
  },
  {
    accessorKey: 'inStock',
    header: 'Stock',
    cell: ({ row }) => {
      const badge = getStockBadge(row.original)

      return h(UBadge, {
        label: row.original.quantity !== null ? `${badge.label} · ${row.original.quantity}` : badge.label,
        color: badge.color,
        variant: 'subtle'
      })
    }
  },
  {
    accessorKey: 'manufacturer',
    header: 'Appareil',
    cell: ({ row }) => h('span', { class: 'text-sm text-toned' }, [row.original.manufacturer, row.original.model].filter(Boolean).join(' · ') || '—')
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => row.original.url
      ? h(UButton, {
          'to': row.original.url,
          'target': '_blank',
          'icon': 'i-lucide-external-link',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'square': true,
          'aria-label': 'Ouvrir chez MobileSentrix'
        })
      : null
  }
]

const categoryColumns: TableColumn<MobileSentrixCategorySummary>[] = [
  {
    accessorKey: 'name',
    header: 'Catégorie',
    cell: ({ row }) => h('div', { class: 'min-w-0 leading-tight' }, [
      h('p', { class: 'truncate font-medium text-highlighted' }, row.original.name),
      h('p', { class: 'truncate text-xs text-toned' }, `ID ${row.original.id}${row.original.parentId ? ` · Parent ${row.original.parentId}` : ''}`)
    ])
  },
  {
    accessorKey: 'productCount',
    header: 'Produits',
    cell: ({ row }) => h('span', { class: 'text-sm text-toned' }, row.original.productCount ?? '—')
  },
  {
    accessorKey: 'isActive',
    header: 'Statut',
    cell: ({ row }) => row.original.isActive === null
      ? h(UBadge, { label: 'Inconnu', color: 'neutral', variant: 'subtle' })
      : h(UBadge, { label: row.original.isActive ? 'Active' : 'Inactive', color: row.original.isActive ? 'success' : 'neutral', variant: 'subtle' })
  }
]
</script>

<template>
  <UDashboardPanel id="mobilesentrix">
    <template #header>
      <UDashboardNavbar title="MobileSentrix">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            label="Statut"
            color="neutral"
            variant="ghost"
            @click="refreshStatus"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-4">
        <UAlert
          v-if="status && !status.readyForOAuth"
          icon="i-lucide-triangle-alert"
          color="error"
          variant="soft"
          title="Configuration MobileSentrix incomplète"
          description="Renseignez MOBILESENTRIX_CONSUMER_NAME, MOBILESENTRIX_CONSUMER_KEY et MOBILESENTRIX_CONSUMER_SECRET dans les variables d’environnement du serveur."
        />

        <UAlert
          v-else-if="status && !status.readyForApi"
          icon="i-lucide-key-round"
          color="warning"
          variant="soft"
          title="Tokens OAuth requis pour les ressources"
          description="La doc REST MobileSentrix demande Consumer Key, Consumer Secret, Access Token et Access Token Secret dans l’Authorization. Lancez la connexion MobileSentrix, puis ajoutez les deux tokens générés aux variables d’environnement du serveur."
        >
          <template #actions>
            <UButton
              v-if="status.readyForOAuth"
              :to="status.authorizePath"
              icon="i-lucide-plug"
              label="Connecter MobileSentrix"
              color="warning"
              variant="solid"
            />
          </template>
        </UAlert>

        <UAlert
          v-else-if="status && status.readyForApi && !status.hasRestAuthHeader"
          icon="i-lucide-shield-alert"
          color="warning"
          variant="soft"
          title="Accès REST MobileSentrix probablement bloqué"
          description="Les tokens OAuth sont présents, mais le serveur reçoit une page Cloudflare avant l’API JSON. Demandez à MobileSentrix comment autoriser les appels serveur: allowlist, header REST dédié ou endpoint API séparé. Si un header est fourni, renseignez MOBILESENTRIX_REST_AUTH_HEADER_NAME et MOBILESENTRIX_REST_AUTH_HEADER_VALUE."
        />

        <UCard
          v-if="shouldShowOauthReturn"
          :ui="{ body: 'space-y-3' }"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="font-medium text-highlighted">
                Retour OAuth MobileSentrix
              </p>
              <p class="text-sm text-toned">
                Échangez le token temporaire contre les tokens API permanents.
              </p>
            </div>

            <UButton
              v-if="hasOauthCallback && !oauthResult"
              icon="i-lucide-key-round"
              label="Générer les tokens API"
              :loading="oauthExchangePending"
              @click="exchangeOAuthToken"
            />
          </div>

          <UAlert
            v-if="oauthExchangeError"
            icon="i-lucide-shield-alert"
            color="warning"
            variant="soft"
            title="Échange serveur bloqué"
            :description="oauthExchangeError"
          >
            <template #actions>
              <UButton
                v-if="browserExchangePath"
                :to="browserExchangePath"
                target="_blank"
                icon="i-lucide-external-link"
                label="Échange navigateur"
                color="warning"
                variant="solid"
              />
            </template>
          </UAlert>

          <div v-else-if="hasOauthCallback && !oauthResult" class="flex flex-wrap items-center gap-2 text-sm text-toned">
            <span>Si MobileSentrix bloque l’échange serveur, utilisez l’échange direct dans le navigateur.</span>
            <UButton
              v-if="browserExchangePath"
              :to="browserExchangePath"
              target="_blank"
              icon="i-lucide-external-link"
              label="Échange navigateur"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </div>

          <div v-if="oauthResult" class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <UTextarea
              :model-value="`MOBILESENTRIX_ACCESS_TOKEN=${oauthResult.accessToken}\nMOBILESENTRIX_ACCESS_TOKEN_SECRET=${oauthResult.accessTokenSecret}`"
              readonly
              autoresize
              :rows="2"
            />
            <UButton
              icon="i-lucide-copy"
              :label="copiedEnv ? 'Copié' : 'Copier pour .env'"
              color="neutral"
              variant="outline"
              @click="copyEnvTokens"
            />
          </div>
        </UCard>

        <UCard
          :ui="{ body: 'p-0 sm:p-0' }"
          class="min-h-0 flex-1 overflow-hidden"
        >
          <UTabs
            :items="tabs"
            class="h-full"
            :ui="{ content: 'min-h-0 p-4' }"
          >
            <template #search>
              <div class="flex h-full min-h-0 flex-col gap-4">
                <UDashboardToolbar class="flex flex-wrap items-end gap-3 px-0 py-0">
                  <UFormField label="Recherche produit" class="min-w-[18rem] flex-1">
                    <UInput
                      v-model="searchTerm"
                      icon="i-lucide-search"
                      placeholder="Ex. iPhone 15 écran, batterie Samsung..."
                      :disabled="!canUseApi"
                      @keydown.enter.prevent="searchProducts"
                    />
                  </UFormField>

                  <UFormField label="Résultats">
                    <UInputNumber
                      v-model="searchLimit"
                      :min="1"
                      :max="50"
                      class="w-28"
                      :disabled="!canUseApi"
                    />
                  </UFormField>

                  <UButton
                    icon="i-lucide-search"
                    label="Rechercher"
                    :loading="searchPending"
                    :disabled="!canUseApi"
                    @click="searchProducts"
                  />
                </UDashboardToolbar>

                <div v-if="searchResult?.categories.length" class="flex flex-wrap gap-2">
                  <UBadge
                    v-for="category in searchResult.categories.slice(0, 8)"
                    :key="category.id"
                    :label="category.name"
                    color="neutral"
                    variant="subtle"
                  />
                </div>

                <UTable
                  :data="searchResult?.items || []"
                  :columns="productColumns"
                  sticky="header"
                  :loading="searchPending"
                  class="min-h-0 flex-1"
                />
              </div>
            </template>

            <template #devices>
              <div class="flex h-full min-h-0 flex-col gap-4">
                <UDashboardToolbar class="flex flex-wrap items-end gap-3 px-0 py-0">
                  <UFormField label="Page">
                    <UInputNumber
                      v-model="devicePage"
                      :min="1"
                      class="w-28"
                      :disabled="!canUseApi"
                    />
                  </UFormField>

                  <UFormField label="Limite">
                    <UInputNumber
                      v-model="deviceLimit"
                      :min="1"
                      :max="50"
                      class="w-28"
                      :disabled="!canUseApi"
                    />
                  </UFormField>

                  <UButton
                    icon="i-lucide-smartphone"
                    label="Charger les appareils"
                    :loading="devicesPending"
                    :disabled="!canUseApi"
                    @click="loadDevices"
                  />
                </UDashboardToolbar>

                <UTable
                  :data="devicesResult?.items || []"
                  :columns="productColumns"
                  sticky="header"
                  :loading="devicesPending"
                  class="min-h-0 flex-1"
                />
              </div>
            </template>

            <template #categories>
              <div class="flex h-full min-h-0 flex-col gap-4">
                <UDashboardToolbar class="flex flex-wrap items-end gap-3 px-0 py-0">
                  <UFormField label="SKU" description="Filtre précis, accepte sku ou new_sku selon MobileSentrix." class="min-w-[14rem]">
                    <UInput
                      v-model="productSku"
                      icon="i-lucide-barcode"
                      placeholder="107082..."
                      :disabled="!canUseApi"
                    />
                  </UFormField>

                  <UFormField label="Catégorie ID" class="min-w-[10rem]">
                    <UInput
                      v-model="categoryId"
                      icon="i-lucide-list-tree"
                      placeholder="Ex. 116"
                      :disabled="!canUseApi"
                    />
                  </UFormField>

                  <UButton
                    icon="i-lucide-package-search"
                    label="Produits filtrés"
                    color="neutral"
                    variant="outline"
                    :loading="productsPending"
                    :disabled="!canUseApi"
                    @click="loadProducts"
                  />

                  <UButton
                    icon="i-lucide-list-tree"
                    label="Charger les catégories"
                    :loading="categoriesPending"
                    :disabled="!canUseApi"
                    @click="loadCategories"
                  />
                </UDashboardToolbar>

                <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <div class="min-h-0 overflow-hidden rounded-lg border border-default">
                    <UTable
                      :data="productsResult?.items || []"
                      :columns="productColumns"
                      sticky="header"
                      :loading="productsPending"
                      class="h-full"
                    />
                  </div>

                  <div class="min-h-0 overflow-hidden rounded-lg border border-default">
                    <UTable
                      :data="categoriesResult?.items || []"
                      :columns="categoryColumns"
                      sticky="header"
                      :loading="categoriesPending"
                      class="h-full"
                    />
                  </div>
                </div>
              </div>
            </template>
          </UTabs>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
