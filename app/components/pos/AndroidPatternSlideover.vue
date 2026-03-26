<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  modelValue?: string | null
}>()

const emit = defineEmits<{
  save: [patternText: string]
}>()

type PointPosition = {
  x: number
  y: number
}

const boardRef = ref<HTMLElement | null>(null)
const pointRefs = ref<Record<number, HTMLElement | null>>({})
const patternPoints = ref<number[]>([])
const isDrawing = ref(false)
const pointerPosition = ref<PointPosition | null>(null)
const boardSize = ref({
  width: 1,
  height: 1
})

const gridItems = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9]
]

const patternText = computed(() => {
  return patternPoints.value.length
    ? `Pattern ${patternPoints.value.join('-')}`
    : ''
})

const activePoint = computed(() => patternPoints.value.at(-1) ?? null)

const pointCenters = computed<Record<number, PointPosition>>(() => {
  const board = boardRef.value

  if (!board) {
    return {}
  }

  const boardRect = board.getBoundingClientRect()

  return Object.fromEntries(
    Object.entries(pointRefs.value).flatMap(([key, element]) => {
      if (!element) {
        return []
      }

      const rect = element.getBoundingClientRect()
      const point = Number(key)

      return [[point, {
        x: rect.left - boardRect.left + (rect.width / 2),
        y: rect.top - boardRect.top + (rect.height / 2)
      }]]
    })
  )
})

const pathPoints = computed(() => {
  const centers = pointCenters.value

  return patternPoints.value
    .map(point => centers[point])
    .filter((value): value is PointPosition => Boolean(value))
})

const committedPath = computed(() => {
  return pathPoints.value
    .map(point => `${point.x},${point.y}`)
    .join(' ')
})

const previewPath = computed(() => {
  if (!isDrawing.value || !pointerPosition.value) {
    return committedPath.value
  }

  const points = [...pathPoints.value, pointerPosition.value]

  return points.map(point => `${point.x},${point.y}`).join(' ')
})

function setPointRef(point: number, element: Element | ComponentPublicInstance | null) {
  const componentRoot = element && typeof element === 'object' && '$el' in element
    ? element.$el
    : null

  pointRefs.value[point] = element instanceof HTMLElement
    ? element
    : componentRoot instanceof HTMLElement
      ? componentRoot
      : null
}

function syncBoardMetrics() {
  const board = boardRef.value

  if (!board) {
    return
  }

  boardSize.value = {
    width: Math.max(board.clientWidth, 1),
    height: Math.max(board.clientHeight, 1)
  }
}

function parsePattern(value?: string | null) {
  if (!value?.toLowerCase().startsWith('pattern')) {
    return []
  }

  return value
    .replace(/pattern/i, '')
    .split(/[^0-9]+/)
    .map(part => Number(part))
    .filter(point => Number.isInteger(point) && point >= 1 && point <= 9)
    .filter((point, index, array) => array.indexOf(point) === index)
}

function clearPattern() {
  patternPoints.value = []
  pointerPosition.value = null
  isDrawing.value = false
}

function getPointStep(point: number) {
  const index = patternPoints.value.indexOf(point)
  return index === -1 ? null : index + 1
}

function getPointCoordinates(point: number) {
  const row = Math.floor((point - 1) / 3)
  const col = (point - 1) % 3

  return { row, col }
}

function getIntermediatePoint(from: number, to: number) {
  const start = getPointCoordinates(from)
  const end = getPointCoordinates(to)
  const rowDiff = Math.abs(start.row - end.row)
  const colDiff = Math.abs(start.col - end.col)

  if (Math.max(rowDiff, colDiff) <= 1) {
    return null
  }

  if (((start.row + end.row) % 2) !== 0 || ((start.col + end.col) % 2) !== 0) {
    return null
  }

  const middleRow = (start.row + end.row) / 2
  const middleCol = (start.col + end.col) / 2

  return (middleRow * 3) + middleCol + 1
}

function appendPoint(point: number) {
  if (patternPoints.value.includes(point)) {
    return
  }

  const previous = patternPoints.value.at(-1)

  if (previous) {
    const intermediate = getIntermediatePoint(previous, point)

    if (intermediate && !patternPoints.value.includes(intermediate)) {
      patternPoints.value = [...patternPoints.value, intermediate]
    }
  }

  patternPoints.value = [...patternPoints.value, point]
}

function updatePointerPosition(clientX: number, clientY: number) {
  const board = boardRef.value

  if (!board) {
    return
  }

  syncBoardMetrics()

  const rect = board.getBoundingClientRect()

  pointerPosition.value = {
    x: clientX - rect.left,
    y: clientY - rect.top
  }
}

function findPointAtPosition(clientX: number, clientY: number) {
  for (const [pointKey, element] of Object.entries(pointRefs.value)) {
    if (!element) {
      continue
    }

    const rect = element.getBoundingClientRect()
    const centerX = rect.left + (rect.width / 2)
    const centerY = rect.top + (rect.height / 2)
    const radius = Math.min(rect.width, rect.height) * 0.42
    const distance = Math.hypot(clientX - centerX, clientY - centerY)

    if (distance <= radius) {
      return Number(pointKey)
    }
  }

  return null
}

function startDrawing(point: number, event: PointerEvent) {
  const board = boardRef.value

  if (!board) {
    return
  }

  if (!patternPoints.value.length) {
    clearPattern()
  }

  isDrawing.value = true
  updatePointerPosition(event.clientX, event.clientY)
  appendPoint(point)
  board.setPointerCapture(event.pointerId)
}

function handleBoardPointerMove(event: PointerEvent) {
  if (!isDrawing.value) {
    return
  }

  updatePointerPosition(event.clientX, event.clientY)

  const point = findPointAtPosition(event.clientX, event.clientY)

  if (point) {
    appendPoint(point)
  }
}

function stopDrawing(event?: PointerEvent) {
  if (!isDrawing.value) {
    return
  }

  if (event && boardRef.value?.hasPointerCapture(event.pointerId)) {
    boardRef.value.releasePointerCapture(event.pointerId)
  }

  isDrawing.value = false
  pointerPosition.value = null
}

function savePattern() {
  if (!patternText.value) {
    return
  }

  emit('save', patternText.value)
  open.value = false
}

watch(open, (isOpen) => {
  if (!isOpen) {
    return
  }

  patternPoints.value = parsePattern(props.modelValue)
  isDrawing.value = false
  pointerPosition.value = null

  nextTick(() => {
    syncBoardMetrics()
  })
})

defineShortcuts({
  enter: () => {
    if (open.value && patternPoints.value.length) {
      savePattern()
    }
  }
})
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Pattern Android"
    description="Dessinez le schéma de déverrouillage comme sur l’appareil, puis validez pour remplir le code d’accès."
    side="right"
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div class="space-y-5">
        <div class="rounded-2xl border border-default bg-elevated/50 p-4">
          <p class="text-xs uppercase tracking-[0.14em] text-toned">
            Valeur enregistrée
          </p>
          <p class="mt-2 text-sm font-medium text-highlighted">
            {{ patternText || 'Aucun point sélectionné' }}
          </p>
          <p class="mt-2 text-xs text-toned">
            Glissez le doigt ou le stylet sur les points. Entrée valide le schéma.
          </p>
        </div>

        <div
          ref="boardRef"
          class="relative rounded-[2rem] border border-default bg-gradient-to-br from-default via-elevated/40 to-default p-6 shadow-sm select-none touch-none"
          @pointermove="handleBoardPointerMove"
          @pointerup="stopDrawing"
          @pointercancel="stopDrawing"
          @pointerleave="stopDrawing"
        >
          <svg
            class="pointer-events-none absolute inset-0 z-10 size-full"
            :viewBox="`0 0 ${boardSize.width} ${boardSize.height}`"
            preserveAspectRatio="none"
          >
            <polyline
              v-if="committedPath"
              :points="committedPath"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="8"
              class="text-primary/45"
            />
            <polyline
              v-if="isDrawing && previewPath"
              :points="previewPath"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="10"
              class="text-primary"
            />
          </svg>

          <div class="relative z-20 grid gap-7">
            <div
              v-for="(row, rowIndex) in gridItems"
              :key="rowIndex"
              class="grid grid-cols-3 gap-7"
            >
              <button
                v-for="point in row"
                :key="point"
                :ref="(el) => setPointRef(point, el)"
                type="button"
                class="relative mx-auto flex aspect-square w-full max-w-28 items-center justify-center rounded-full transition"
                :class="getPointStep(point)
                  ? activePoint === point
                    ? 'scale-[1.03]'
                    : ''
                  : 'hover:scale-[1.01]'"
                @pointerdown.prevent="startDrawing(point, $event)"
              >
                <span
                  class="absolute inset-0 rounded-full border transition"
                  :class="getPointStep(point)
                    ? activePoint === point
                      ? 'border-primary/30 bg-primary/18 ring-8 ring-primary/10'
                      : 'border-primary/20 bg-primary/12'
                    : 'border-default bg-elevated/65'"
                />
                <span
                  class="absolute rounded-full transition"
                  :class="getPointStep(point)
                    ? activePoint === point
                      ? 'size-7 bg-primary ring-4 ring-primary/20'
                      : 'size-6 bg-primary'
                    : 'size-4 bg-toned/70'"
                />
              </button>
            </div>
          </div>
        </div>

        <div class="min-h-6">
          <p v-if="!patternPoints.length" class="text-sm text-toned">
            Touchez puis glissez sur les points dans l’ordre du schéma.
          </p>
          <p v-else class="text-xs text-toned">
            Séquence: <span class="font-medium text-highlighted">{{ patternPoints.join(' - ') }}</span>
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <UButton
          label="Effacer"
          color="neutral"
          variant="ghost"
          :disabled="!patternPoints.length"
          @click="clearPattern"
        />
        <div class="flex items-center gap-3">
          <UButton
            label="Annuler"
            color="neutral"
            variant="ghost"
            @click="open = false"
          />
          <UButton
            label="Utiliser ce pattern"
            icon="i-lucide-check"
            :disabled="!patternPoints.length"
            @click="savePattern"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
