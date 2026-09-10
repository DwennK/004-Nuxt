<script setup lang="ts">
import type { MobileSentrixOAuthExchangeResponse, MobileSentrixStatusResponse } from '~~/shared/types/pos'

const route = useRoute()
const toast = useToast()

const copiedEnv = ref(false)
const oauthExchangePending = ref(false)
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
</script>

<template>
  <UDashboardPanel id="mobilesentrix" :ui="{ body: 'overflow-hidden p-2 sm:p-4' }">
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
            @click="() => refreshStatus()"
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

        <MobilesentrixExplorer :can-use-api="canUseApi" :base-url="status?.baseUrl || ''" />
      </div>
    </template>
  </UDashboardPanel>
</template>
