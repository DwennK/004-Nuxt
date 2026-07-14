<script setup lang="ts">
interface TurnstileApi {
  render: (container: HTMLElement, options: {
    'sitekey': string
    'action': string
    'theme': 'auto'
    'language': string
    'response-field': boolean
    'callback': (token: string) => void
    'error-callback': (code: string) => void
    'expired-callback': () => void
    'timeout-callback': () => void
    'unsupported-callback': () => void
  }) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

type TurnstileWindow = Window & typeof globalThis & {
  turnstile?: TurnstileApi
}

const props = defineProps<{
  siteKey: string
}>()

const emit = defineEmits<{
  'update:modelValue': [token: string | null]
  'error': [message: string]
}>()

const container = ref<HTMLDivElement | null>(null)
let widgetId: string | null = null
let disposed = false

function loadTurnstile() {
  const browserWindow = window as TurnstileWindow

  if (browserWindow.turnstile) {
    return Promise.resolve(browserWindow.turnstile)
  }

  return new Promise<TurnstileApi>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-turnstile-script]')
    const script = existingScript || document.createElement('script')

    const handleLoad = () => {
      const api = (window as TurnstileWindow).turnstile

      if (api) {
        resolve(api)
      } else {
        reject(new Error('API Turnstile indisponible'))
      }
    }

    const handleError = () => reject(new Error('Chargement de Turnstile impossible'))

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })

    if (!existingScript) {
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.defer = true
      script.dataset.turnstileScript = 'true'
      document.head.appendChild(script)
    }
  })
}

async function renderWidget() {
  const containerElement = container.value
  if (!containerElement || !props.siteKey) return

  try {
    const turnstile = await loadTurnstile()
    if (disposed) return

    widgetId = turnstile.render(containerElement, {
      'sitekey': props.siteKey,
      'action': 'login',
      'theme': 'auto',
      'language': 'fr',
      'response-field': false,
      'callback': token => emit('update:modelValue', token),
      'error-callback': () => {
        emit('update:modelValue', null)
        emit('error', 'La vérification anti-robot a échoué. Réessayez.')
      },
      'expired-callback': () => emit('update:modelValue', null),
      'timeout-callback': () => emit('update:modelValue', null),
      'unsupported-callback': () => {
        emit('update:modelValue', null)
        emit('error', 'Ce navigateur ne permet pas la vérification anti-robot.')
      }
    })
  } catch {
    emit('error', 'La vérification anti-robot ne peut pas être chargée.')
  }
}

function reset() {
  emit('update:modelValue', null)

  const turnstile = (window as TurnstileWindow).turnstile
  if (turnstile && widgetId) {
    turnstile.reset(widgetId)
  }
}

defineExpose({ reset })

onMounted(() => {
  void renderWidget()
})

onBeforeUnmount(() => {
  disposed = true
  const turnstile = (window as TurnstileWindow).turnstile
  if (turnstile && widgetId) {
    turnstile.remove(widgetId)
  }
})
</script>

<template>
  <div
    ref="container"
    class="flex min-h-[65px] w-full items-center justify-center"
    aria-label="Vérification anti-robot"
  />
</template>
