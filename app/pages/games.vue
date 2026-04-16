<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

type GameTab = 'wordle' | 'higher' | 'tic' | 'aim' | 'reflex'
type CellStatus = 'empty' | 'pending' | 'correct' | 'present' | 'absent'
type Cell = { letter: string, status: CellStatus }
type GameStatus = 'playing' | 'won' | 'lost'
type WordLength = 5 | 6 | 7
type HigherHint = 'plus' | 'moins' | 'trouve'
type TicMark = 'X' | 'O'
type AimStatus = 'idle' | 'playing' | 'done'
type ReflexStatus = 'idle' | 'waiting' | 'ready' | 'too-soon' | 'done'

const selectedGame = ref<GameTab>('wordle')

const gameTabs: TabsItem[] = [
  { label: 'Mot mystère', icon: 'i-lucide-spell-check', value: 'wordle', slot: 'wordle' },
  { label: 'Plus ou moins', icon: 'i-lucide-binary', value: 'higher', slot: 'higher' },
  { label: 'Morpion', icon: 'i-lucide-grid-3x3', value: 'tic', slot: 'tic' },
  { label: 'Précision', icon: 'i-lucide-crosshair', value: 'aim', slot: 'aim' },
  { label: 'Réflexe', icon: 'i-lucide-timer-reset', value: 'reflex', slot: 'reflex' }
]

const MAX_GUESSES = 6

const WORDS: Record<WordLength, string[]> = {
  5: [
    'MONDE', 'TABLE', 'JOUER', 'FORET', 'PLAGE', 'CHIEN', 'PORTE', 'VERTE',
    'CHAUD', 'FROID', 'BOITE', 'LIVRE', 'FLEUR', 'PIANO', 'GLACE', 'HERBE',
    'RADIO', 'FERME', 'NUAGE', 'PLUIE', 'AVOIR', 'DANSE', 'VERRE', 'VERBE',
    'LIBRE', 'BANDE', 'CARTE', 'POCHE', 'SABLE', 'ROUGE', 'JAUNE', 'MERCI'
  ],
  6: [
    'MAISON', 'JARDIN', 'SOLEIL', 'VOYAGE', 'BATEAU', 'VOLANT', 'ORANGE',
    'CARNET', 'PARLER', 'MANGER', 'DANSER', 'SALADE', 'ECOLES', 'VOILES',
    'LAMPES', 'NUAGES', 'PLUIES', 'PLAGES', 'LIVRES', 'TABLES', 'ROUGES',
    'POULET', 'HIVERS'
  ],
  7: [
    'BONJOUR', 'FAMILLE', 'CHATEAU', 'FROMAGE', 'CUISINE', 'FENETRE',
    'JARDINS', 'MAISONS', 'VOYAGES', 'JOURNAL', 'GATEAUX', 'BOUGIES',
    'CERISES', 'CHAPEAU', 'VIOLETS', 'GARCONS', 'FUSEAUX', 'CHANSON',
    'PLANTES', 'FLEURIR', 'BLEUETS', 'CHANTER', 'MUSIQUE', 'RECETTE'
  ]
}

const LENGTH_OPTIONS = [
  { label: '5 lettres', value: 5 },
  { label: '6 lettres', value: 6 },
  { label: '7 lettres', value: 7 }
]

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Y'],
  ['ENTER', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK']
]

const wordLength = ref<WordLength>(5)
const targetWord = ref('')
const guesses = ref<string[]>([])
const currentGuess = ref('')
const wordleStatus = ref<GameStatus>('playing')
const wordleMessage = ref<string | null>(null)
const flashInvalid = ref(false)

function normalize(input: string) {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}

function pickWord() {
  const pool = WORDS[wordLength.value]
  return pool[Math.floor(Math.random() * pool.length)] || ''
}

function newWordleGame() {
  targetWord.value = pickWord()
  guesses.value = []
  currentGuess.value = ''
  wordleStatus.value = 'playing'
  wordleMessage.value = null
}

function evaluateGuess(guess: string): Cell[] {
  const target = targetWord.value
  const cells: Cell[] = Array.from({ length: guess.length }, () => ({ letter: '', status: 'absent' }))
  const used = new Array(target.length).fill(false)

  for (let i = 0; i < guess.length; i++) {
    const letter = guess[i]!
    if (target[i] === letter) {
      cells[i] = { letter, status: 'correct' }
      used[i] = true
    }
  }

  for (let i = 0; i < guess.length; i++) {
    if (cells[i]!.status === 'correct') continue
    const letter = guess[i]!
    const idx = target.split('').findIndex((l, j) => !used[j] && l === letter)

    if (idx >= 0) {
      cells[i] = { letter, status: 'present' }
      used[idx] = true
    } else {
      cells[i] = { letter, status: 'absent' }
    }
  }

  return cells
}

const board = computed<Cell[][]>(() => {
  const rows: Cell[][] = guesses.value.map(guess => evaluateGuess(guess))

  if (wordleStatus.value === 'playing') {
    const current: Cell[] = []

    for (let i = 0; i < wordLength.value; i++) {
      current.push({ letter: currentGuess.value[i] || '', status: 'pending' })
    }

    rows.push(current)
  }

  while (rows.length < MAX_GUESSES) {
    rows.push(Array.from({ length: wordLength.value }, () => ({ letter: '', status: 'empty' })))
  }

  return rows
})

const keyStatuses = computed(() => {
  const map: Record<string, CellStatus> = {}

  for (const guess of guesses.value) {
    const cells = evaluateGuess(guess)

    for (const cell of cells) {
      const prev = map[cell.letter]

      if (prev === 'correct') continue
      if (prev === 'present' && cell.status === 'absent') continue
      map[cell.letter] = cell.status
    }
  }

  return map
})

function triggerInvalid(reason: string) {
  wordleMessage.value = reason
  flashInvalid.value = true
  window.setTimeout(() => {
    flashInvalid.value = false
  }, 400)
}

function submitGuess() {
  if (wordleStatus.value !== 'playing') return

  if (currentGuess.value.length !== wordLength.value) {
    triggerInvalid(`Complète les ${wordLength.value} lettres.`)
    return
  }

  const guess = currentGuess.value
  guesses.value.push(guess)
  currentGuess.value = ''
  wordleMessage.value = null

  if (guess === targetWord.value) {
    wordleStatus.value = 'won'
    wordleMessage.value = `Bravo ! Trouvé en ${guesses.value.length} coup${guesses.value.length > 1 ? 's' : ''}.`
    return
  }

  if (guesses.value.length >= MAX_GUESSES) {
    wordleStatus.value = 'lost'
    wordleMessage.value = `Perdu. Le mot était ${targetWord.value}.`
  }
}

function pressKey(key: string) {
  if (wordleStatus.value !== 'playing') return

  if (key === 'ENTER') {
    submitGuess()
    return
  }

  if (key === 'BACK') {
    currentGuess.value = currentGuess.value.slice(0, -1)
    wordleMessage.value = null
    return
  }

  if (currentGuess.value.length >= wordLength.value) return
  currentGuess.value += key
}

function handleKeydown(event: KeyboardEvent) {
  if (selectedGame.value !== 'wordle') return
  if (event.ctrlKey || event.metaKey || event.altKey) return

  const target = event.target as HTMLElement | null
  const tagName = target?.tagName?.toLowerCase()

  if (tagName && ['input', 'textarea', 'select'].includes(tagName)) {
    return
  }

  const key = event.key

  if (key === 'Enter') {
    event.preventDefault()
    pressKey('ENTER')
    return
  }

  if (key === 'Backspace') {
    event.preventDefault()
    pressKey('BACK')
    return
  }

  if (key.length === 1) {
    const normalized = normalize(key)

    if (/^[A-Z]$/.test(normalized)) {
      event.preventDefault()
      pressKey(normalized)
    }
  }
}

function cellClass(status: CellStatus) {
  if (status === 'correct') return 'bg-green-600 text-white border-green-600'
  if (status === 'present') return 'bg-yellow-500 text-white border-yellow-500'
  if (status === 'absent') return 'bg-neutral-500 text-white border-neutral-500'
  if (status === 'pending') return 'bg-default border-default text-default'
  return 'bg-elevated/40 border-default/60 text-muted'
}

function keyClass(status: CellStatus | undefined) {
  if (status === 'correct') return 'bg-green-600 text-white hover:bg-green-700'
  if (status === 'present') return 'bg-yellow-500 text-white hover:bg-yellow-600'
  if (status === 'absent') return 'bg-neutral-500 text-white hover:bg-neutral-600'
  return 'bg-elevated text-default hover:bg-accented'
}

const higherTarget = ref(0)
const higherInput = ref('')
const higherHistory = ref<{ value: number, hint: HigherHint }[]>([])
const higherStatus = ref<GameStatus>('playing')
const higherMessage = ref('Trouve le nombre caché entre 1 et 100 en 8 essais maximum.')
const HIGHER_MAX_ATTEMPTS = 8

function newHigherGame() {
  higherTarget.value = Math.floor(Math.random() * 100) + 1
  higherInput.value = ''
  higherHistory.value = []
  higherStatus.value = 'playing'
  higherMessage.value = 'Trouve le nombre caché entre 1 et 100 en 8 essais maximum.'
}

const higherRemaining = computed(() => HIGHER_MAX_ATTEMPTS - higherHistory.value.length)

function submitHigherGuess() {
  if (higherStatus.value !== 'playing') return

  const value = Number.parseInt(higherInput.value, 10)

  if (!Number.isInteger(value) || value < 1 || value > 100) {
    higherMessage.value = 'Entre un nombre entier entre 1 et 100.'
    return
  }

  if (higherHistory.value.some(entry => entry.value === value)) {
    higherMessage.value = 'Ce nombre a déjà été tenté.'
    return
  }

  if (value === higherTarget.value) {
    higherHistory.value.unshift({ value, hint: 'trouve' })
    higherStatus.value = 'won'
    higherMessage.value = `Bien joué. ${value} était le bon nombre.`
    higherInput.value = ''
    return
  }

  const hint: HigherHint = value < higherTarget.value ? 'plus' : 'moins'
  higherHistory.value.unshift({ value, hint })
  higherInput.value = ''

  if (higherHistory.value.length >= HIGHER_MAX_ATTEMPTS) {
    higherStatus.value = 'lost'
    higherMessage.value = `Perdu. Il fallait trouver ${higherTarget.value}.`
    return
  }

  higherMessage.value = hint === 'plus' ? 'Plus haut.' : 'Plus bas.'
}

const ticBoard = ref<(TicMark | null)[]>(Array(9).fill(null))
const ticCurrent = ref<TicMark>('X')
const ticMessage = ref('Tu joues X. Aligne 3 symboles avant l’IA.')
const ticStatus = ref<GameStatus>('playing')
const ticScores = ref({
  player: 0,
  ai: 0,
  draw: 0
})

const ticWinningLines: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
]

function getTicWinner(board: (TicMark | null)[]) {
  for (const [a, b, c] of ticWinningLines) {
    const first = board[a]

    if (first && first === board[b] && first === board[c]) {
      return first
    }
  }

  return null
}

function newTicGame() {
  ticBoard.value = Array(9).fill(null)
  ticCurrent.value = 'X'
  ticStatus.value = 'playing'
  ticMessage.value = 'Tu joues X. Aligne 3 symboles avant l’IA.'
}

function maybeEndTicRound(board: (TicMark | null)[]) {
  const winner = getTicWinner(board)

  if (winner === 'X') {
    ticStatus.value = 'won'
    ticScores.value.player += 1
    ticMessage.value = 'Bien joué, tu as gagné.'
    return true
  }

  if (winner === 'O') {
    ticStatus.value = 'lost'
    ticScores.value.ai += 1
    ticMessage.value = 'L’IA a gagné cette manche.'
    return true
  }

  if (board.every(Boolean)) {
    ticStatus.value = 'lost'
    ticScores.value.draw += 1
    ticMessage.value = 'Match nul.'
    return true
  }

  return false
}

function chooseTicMove(board: (TicMark | null)[]) {
  const openIndexes = board
    .map((cell, index) => cell ? null : index)
    .filter((value): value is number => value !== null)

  for (const index of openIndexes) {
    const next = [...board]
    next[index] = 'O'
    if (getTicWinner(next) === 'O') return index
  }

  for (const index of openIndexes) {
    const next = [...board]
    next[index] = 'X'
    if (getTicWinner(next) === 'X') return index
  }

  if (openIndexes.includes(4)) return 4

  const corners = [0, 2, 6, 8].filter(index => openIndexes.includes(index))
  if (corners.length) {
    return corners[Math.floor(Math.random() * corners.length)]!
  }

  return openIndexes[Math.floor(Math.random() * openIndexes.length)]!
}

function playTic(index: number) {
  if (ticStatus.value !== 'playing') return
  if (ticBoard.value[index]) return

  const nextBoard = [...ticBoard.value]
  nextBoard[index] = 'X'
  ticBoard.value = nextBoard

  if (maybeEndTicRound(nextBoard)) return

  ticCurrent.value = 'O'
  ticMessage.value = 'L’IA réfléchit...'

  window.setTimeout(() => {
    if (ticStatus.value !== 'playing') return

    const aiIndex = chooseTicMove(ticBoard.value)
    const aiBoard = [...ticBoard.value]
    aiBoard[aiIndex] = 'O'
    ticBoard.value = aiBoard

    if (maybeEndTicRound(aiBoard)) return

    ticCurrent.value = 'X'
    ticMessage.value = 'À toi.'
  }, 240)
}

const AIM_TOTAL_TARGETS = 15
const aimStatus = ref<AimStatus>('idle')
const aimHits = ref(0)
const aimMessage = ref('Clique 15 cibles le plus vite possible.')
const aimStartedAt = ref<number | null>(null)
const aimFinishedAt = ref<number | null>(null)
const aimTarget = ref({ x: 24, y: 28, size: 56 })
const aimBest = ref<number | null>(null)
const aimHistory = ref<number[]>([])

function placeAimTarget() {
  aimTarget.value = {
    x: 8 + Math.random() * 78,
    y: 10 + Math.random() * 72,
    size: 42 + Math.round(Math.random() * 18)
  }
}

function newAimGame() {
  aimStatus.value = 'idle'
  aimHits.value = 0
  aimStartedAt.value = null
  aimFinishedAt.value = null
  aimMessage.value = 'Clique 15 cibles le plus vite possible.'
  placeAimTarget()
}

function startAimGame() {
  aimStatus.value = 'playing'
  aimHits.value = 0
  aimStartedAt.value = performance.now()
  aimFinishedAt.value = null
  aimMessage.value = 'Vise juste et enchaîne.'
  placeAimTarget()
}

function hitAimTarget() {
  if (aimStatus.value === 'idle') {
    startAimGame()
    return
  }

  if (aimStatus.value !== 'playing') return

  const nextHits = aimHits.value + 1
  aimHits.value = nextHits

  if (nextHits >= AIM_TOTAL_TARGETS) {
    const finishedAt = performance.now()
    aimFinishedAt.value = finishedAt
    aimStatus.value = 'done'
    const duration = Math.round(finishedAt - (aimStartedAt.value || finishedAt))
    aimHistory.value.unshift(duration)
    aimHistory.value = aimHistory.value.slice(0, 5)
    aimBest.value = aimBest.value === null ? duration : Math.min(aimBest.value, duration)
    aimMessage.value = `Terminé en ${duration} ms.`
    return
  }

  placeAimTarget()
}

const aimDuration = computed(() => {
  if (aimStartedAt.value === null) return null

  const end = aimFinishedAt.value ?? performance.now()
  return Math.round(end - aimStartedAt.value)
})

const aimAveragePerTarget = computed(() => {
  if (!aimHits.value || aimStartedAt.value === null) return null

  const elapsed = (aimFinishedAt.value ?? performance.now()) - aimStartedAt.value
  return Math.round(elapsed / aimHits.value)
})

const reflexStatus = ref<ReflexStatus>('idle')
const reflexMessage = ref('Attends le vert puis clique le plus vite possible.')
const reflexResult = ref<number | null>(null)
const reflexBest = ref<number | null>(null)
const reflexHistory = ref<number[]>([])
let reflexTimer: number | undefined
let reflexStartedAt = 0

function clearReflexTimer() {
  if (reflexTimer) {
    window.clearTimeout(reflexTimer)
    reflexTimer = undefined
  }
}

function newReflexGame() {
  clearReflexTimer()
  reflexStatus.value = 'idle'
  reflexMessage.value = 'Attends le vert puis clique le plus vite possible.'
  reflexResult.value = null
}

function startReflexRound() {
  clearReflexTimer()
  reflexStatus.value = 'waiting'
  reflexResult.value = null
  reflexMessage.value = 'Prépare-toi... ne clique pas trop tôt.'

  reflexTimer = window.setTimeout(() => {
    reflexStatus.value = 'ready'
    reflexStartedAt = performance.now()
    reflexMessage.value = 'Maintenant.'
  }, 1400 + Math.random() * 2200)
}

function handleReflexClick() {
  if (reflexStatus.value === 'waiting') {
    clearReflexTimer()
    reflexStatus.value = 'too-soon'
    reflexMessage.value = 'Trop tôt. Relance la manche.'
    reflexResult.value = null
    return
  }

  if (reflexStatus.value !== 'ready') return

  const elapsed = Math.round(performance.now() - reflexStartedAt)
  reflexStatus.value = 'done'
  reflexResult.value = elapsed
  reflexHistory.value.unshift(elapsed)
  reflexHistory.value = reflexHistory.value.slice(0, 5)
  reflexBest.value = reflexBest.value === null ? elapsed : Math.min(reflexBest.value, elapsed)
  reflexMessage.value = `${elapsed} ms.`
}

const averageReflex = computed(() => {
  if (!reflexHistory.value.length) return null
  return Math.round(reflexHistory.value.reduce((sum, value) => sum + value, 0) / reflexHistory.value.length)
})

const higherTone = computed(() => {
  if (higherStatus.value === 'won') return 'success'
  if (higherStatus.value === 'lost') return 'error'
  return 'neutral'
})

const reflexTone = computed(() => {
  if (reflexStatus.value === 'done') return 'success'
  if (reflexStatus.value === 'too-soon') return 'error'
  if (reflexStatus.value === 'ready') return 'warning'
  return 'neutral'
})

onMounted(() => {
  newWordleGame()
  newHigherGame()
  newTicGame()
  newAimGame()
  newReflexGame()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  clearReflexTimer()
})

watch(wordLength, () => {
  newWordleGame()
})
</script>

<template>
  <UDashboardPanel id="games">
    <template #header>
      <UDashboardNavbar title="Jeux">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col">
        <UTabs
          v-model="selectedGame"
          :items="gameTabs"
          :unmount-on-hide="false"
          color="neutral"
          variant="link"
          class="flex h-full min-h-0 w-full flex-col"
          :ui="{
            content: 'min-h-0 flex-1 outline-none',
            list: 'px-4 pt-2 md:px-6'
          }"
        >
          <template #wordle>
            <div class="flex h-full min-h-0 flex-col bg-default">
              <div class="border-b border-default px-4 py-3 md:px-6">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div class="max-w-2xl">
                    <p class="text-sm font-medium text-highlighted">
                      Mot mystère
                    </p>
                    <p class="text-sm text-toned">
                      Trouve le mot en {{ MAX_GUESSES }} essais. Lettres bien placées en vert, mal placées en jaune.
                    </p>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <USelect
                      v-model="wordLength"
                      :items="LENGTH_OPTIONS"
                      size="sm"
                      class="min-w-32"
                    />
                    <UButton
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Nouvelle partie"
                      @click="newWordleGame"
                    />
                  </div>
                </div>
              </div>

              <div class="flex flex-1 flex-col items-center justify-start gap-6 overflow-auto px-4 py-6 sm:justify-center md:px-6">
                <div class="flex min-h-[3rem] w-full max-w-md items-center justify-center">
                  <UAlert
                    v-if="wordleMessage"
                    :color="wordleStatus === 'won' ? 'success' : wordleStatus === 'lost' ? 'error' : 'neutral'"
                    variant="subtle"
                    :title="wordleMessage"
                    class="w-full"
                  />
                </div>

                <div
                  class="flex flex-col gap-1.5"
                  :class="flashInvalid ? 'animate-pulse' : ''"
                >
                  <div
                    v-for="(row, rowIndex) in board"
                    :key="rowIndex"
                    class="flex gap-1.5"
                  >
                    <div
                      v-for="(cell, cellIndex) in row"
                      :key="cellIndex"
                      :class="[
                        'flex size-12 items-center justify-center rounded-md border-2 font-bold text-xl uppercase transition-colors sm:size-14 sm:text-2xl',
                        cellClass(cell.status)
                      ]"
                    >
                      {{ cell.letter }}
                    </div>
                  </div>
                </div>

                <div class="flex w-full max-w-xl flex-col gap-1.5">
                  <div
                    v-for="(row, rowIndex) in KEYBOARD_ROWS"
                    :key="rowIndex"
                    class="flex justify-center gap-1"
                  >
                    <button
                      v-for="key in row"
                      :key="key"
                      type="button"
                      :class="[
                        'flex h-11 items-center justify-center rounded font-semibold text-sm uppercase transition-colors',
                        key === 'ENTER' || key === 'BACK' ? 'px-3 text-xs' : 'w-8 sm:w-10',
                        keyClass(keyStatuses[key])
                      ]"
                      @click="pressKey(key)"
                    >
                      <template v-if="key === 'BACK'">
                        ⌫
                      </template>
                      <template v-else-if="key === 'ENTER'">
                        Entrée
                      </template>
                      <template v-else>
                        {{ key }}
                      </template>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template #higher>
            <div class="space-y-4 p-4 md:p-6">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div class="max-w-2xl">
                  <p class="text-sm font-medium text-highlighted">
                    Plus ou moins
                  </p>
                  <p class="text-sm text-toned">
                    Devine un nombre caché entre 1 et 100. Chaque tentative te dit s’il faut monter ou descendre.
                  </p>
                </div>

                <UButton
                  icon="i-lucide-rotate-ccw"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  label="Relancer"
                  @click="newHigherGame"
                />
              </div>

              <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <UCard :ui="{ body: 'p-5 sm:p-6' }">
                  <div class="space-y-5">
                    <div class="flex flex-wrap items-center gap-2">
                      <UBadge :color="higherTone" variant="subtle">
                        {{ higherStatus === 'playing' ? `${higherRemaining} essai(s) restant(s)` : higherStatus === 'won' ? 'Trouvé' : 'Perdu' }}
                      </UBadge>
                      <UBadge color="neutral" variant="outline">
                        1 → 100
                      </UBadge>
                    </div>

                    <UAlert
                      :color="higherTone"
                      variant="subtle"
                      :title="higherMessage"
                    />

                    <div class="flex flex-col gap-3 sm:flex-row">
                      <UInput
                        v-model="higherInput"
                        type="number"
                        min="1"
                        max="100"
                        size="xl"
                        class="sm:max-w-48"
                        placeholder="Ex. 42"
                        @keyup.enter="submitHigherGuess"
                      />
                      <UButton
                        label="Tester"
                        size="xl"
                        icon="i-lucide-arrow-right"
                        @click="submitHigherGuess"
                      />
                    </div>
                  </div>
                </UCard>

                <UCard :ui="{ body: 'p-5' }">
                  <div class="space-y-3">
                    <p class="text-sm font-medium text-highlighted">
                      Historique
                    </p>

                    <div v-if="higherHistory.length" class="space-y-2">
                      <div
                        v-for="entry in higherHistory"
                        :key="entry.value"
                        class="flex items-center justify-between rounded-xl border border-default px-3 py-2"
                      >
                        <span class="font-semibold text-highlighted">{{ entry.value }}</span>
                        <UBadge
                          :color="entry.hint === 'trouve' ? 'success' : 'neutral'"
                          variant="subtle"
                        >
                          {{ entry.hint === 'plus' ? 'Plus haut' : entry.hint === 'moins' ? 'Plus bas' : 'Trouvé' }}
                        </UBadge>
                      </div>
                    </div>

                    <UEmpty
                      v-else
                      icon="i-lucide-list-ordered"
                      title="Aucune tentative"
                      description="Tes essais récents apparaîtront ici."
                    />
                  </div>
                </UCard>
              </div>
            </div>
          </template>

          <template #tic>
            <div class="space-y-4 p-4 md:p-6">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div class="max-w-2xl">
                  <p class="text-sm font-medium text-highlighted">
                    Morpion
                  </p>
                  <p class="text-sm text-toned">
                    Tu joues X. Pose ton symbole, bloque l’IA, et tente de prendre la ligne avant elle.
                  </p>
                </div>

                <UButton
                  icon="i-lucide-rotate-ccw"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  label="Nouvelle manche"
                  @click="newTicGame"
                />
              </div>

              <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <UCard :ui="{ body: 'p-5 sm:p-6' }">
                  <div class="space-y-5">
                    <div class="flex flex-wrap items-center gap-2">
                      <UBadge
                        :color="ticStatus === 'won' ? 'success' : ticStatus === 'lost' ? 'error' : 'neutral'"
                        variant="subtle"
                      >
                        {{ ticStatus === 'playing' ? `Tour ${ticCurrent}` : ticMessage }}
                      </UBadge>
                    </div>

                    <UAlert
                      :color="ticStatus === 'won' ? 'success' : ticStatus === 'lost' ? 'error' : 'neutral'"
                      variant="subtle"
                      :title="ticMessage"
                    />

                    <div class="grid max-w-sm grid-cols-3 gap-2">
                      <button
                        v-for="(cell, index) in ticBoard"
                        :key="index"
                        type="button"
                        class="flex aspect-square items-center justify-center rounded-2xl border border-default bg-elevated/40 text-4xl font-black transition hover:bg-elevated"
                        @click="playTic(index)"
                      >
                        <span :class="cell === 'X' ? 'text-primary' : cell === 'O' ? 'text-warning' : 'text-muted'">
                          {{ cell || '·' }}
                        </span>
                      </button>
                    </div>
                  </div>
                </UCard>

                <UCard :ui="{ body: 'p-5' }">
                  <div class="space-y-3">
                    <p class="text-sm font-medium text-highlighted">
                      Score
                    </p>

                    <div class="grid gap-2">
                      <div class="rounded-xl border border-default px-3 py-2">
                        <p class="text-xs uppercase tracking-[0.16em] text-toned">
                          Toi
                        </p>
                        <p class="text-lg font-semibold text-highlighted">
                          {{ ticScores.player }}
                        </p>
                      </div>
                      <div class="rounded-xl border border-default px-3 py-2">
                        <p class="text-xs uppercase tracking-[0.16em] text-toned">
                          IA
                        </p>
                        <p class="text-lg font-semibold text-highlighted">
                          {{ ticScores.ai }}
                        </p>
                      </div>
                      <div class="rounded-xl border border-default px-3 py-2">
                        <p class="text-xs uppercase tracking-[0.16em] text-toned">
                          Nuls
                        </p>
                        <p class="text-lg font-semibold text-highlighted">
                          {{ ticScores.draw }}
                        </p>
                      </div>
                    </div>
                  </div>
                </UCard>
              </div>
            </div>
          </template>

          <template #aim>
            <div class="space-y-4 p-4 md:p-6">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div class="max-w-2xl">
                  <p class="text-sm font-medium text-highlighted">
                    Précision
                  </p>
                  <p class="text-sm text-toned">
                    Clique 15 cibles le plus vite possible. La cible se déplace à chaque hit, avec une taille légèrement variable.
                  </p>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    icon="i-lucide-play"
                    color="primary"
                    size="sm"
                    label="Lancer"
                    @click="startAimGame"
                  />
                  <UButton
                    icon="i-lucide-rotate-ccw"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    label="Reset"
                    @click="newAimGame"
                  />
                </div>
              </div>

              <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <UCard :ui="{ body: 'p-5 sm:p-6' }">
                  <div class="space-y-5">
                    <div class="flex flex-wrap items-center gap-2">
                      <UBadge
                        :color="aimStatus === 'done' ? 'success' : aimStatus === 'playing' ? 'warning' : 'neutral'"
                        variant="subtle"
                      >
                        {{ aimStatus === 'idle' ? 'Prêt' : aimStatus === 'playing' ? `${aimHits}/${AIM_TOTAL_TARGETS} touches` : 'Terminé' }}
                      </UBadge>
                      <UBadge color="neutral" variant="outline">
                        {{ aimDuration !== null ? `${aimDuration} ms` : '0 ms' }}
                      </UBadge>
                    </div>

                    <UAlert
                      :color="aimStatus === 'done' ? 'success' : aimStatus === 'playing' ? 'warning' : 'neutral'"
                      variant="subtle"
                      :title="aimMessage"
                    />

                    <div class="relative h-[420px] overflow-hidden rounded-3xl border border-default bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.04))]">
                      <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:28px_28px]" />

                      <button
                        type="button"
                        class="absolute flex items-center justify-center rounded-full border-4 border-white/90 bg-primary shadow-[0_10px_30px_rgba(34,197,94,0.35)] transition-transform hover:scale-105"
                        :style="{
                          left: `${aimTarget.x}%`,
                          top: `${aimTarget.y}%`,
                          width: `${aimTarget.size}px`,
                          height: `${aimTarget.size}px`,
                          transform: 'translate(-50%, -50%)'
                        }"
                        @click="hitAimTarget"
                      >
                        <span class="flex size-4 rounded-full border-2 border-white bg-white/20" />
                      </button>

                      <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-4 py-3 text-xs uppercase tracking-[0.16em] text-toned">
                        <span>{{ aimStatus === 'idle' ? 'Clique la cible pour démarrer aussi' : 'Enchaîne sans pause' }}</span>
                        <span>{{ AIM_TOTAL_TARGETS - aimHits }} restantes</span>
                      </div>
                    </div>
                  </div>
                </UCard>

                <UCard :ui="{ body: 'p-5' }">
                  <div class="space-y-3">
                    <p class="text-sm font-medium text-highlighted">
                      Stats
                    </p>

                    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      <div class="rounded-xl border border-default px-3 py-2">
                        <p class="text-xs uppercase tracking-[0.16em] text-toned">
                          Temps total
                        </p>
                        <p class="text-lg font-semibold text-highlighted">
                          {{ aimDuration !== null ? `${aimDuration} ms` : '—' }}
                        </p>
                      </div>

                      <div class="rounded-xl border border-default px-3 py-2">
                        <p class="text-xs uppercase tracking-[0.16em] text-toned">
                          Moyenne / cible
                        </p>
                        <p class="text-lg font-semibold text-highlighted">
                          {{ aimAveragePerTarget !== null ? `${aimAveragePerTarget} ms` : '—' }}
                        </p>
                      </div>

                      <div class="rounded-xl border border-default px-3 py-2">
                        <p class="text-xs uppercase tracking-[0.16em] text-toned">
                          Meilleur run
                        </p>
                        <p class="text-lg font-semibold text-highlighted">
                          {{ aimBest !== null ? `${aimBest} ms` : '—' }}
                        </p>
                      </div>
                    </div>

                    <div v-if="aimHistory.length" class="space-y-2">
                      <p class="text-xs uppercase tracking-[0.16em] text-toned">
                        Derniers runs
                      </p>

                      <div class="flex flex-wrap gap-2">
                        <UBadge
                          v-for="value in aimHistory"
                          :key="value"
                          color="neutral"
                          variant="subtle"
                        >
                          {{ value }} ms
                        </UBadge>
                      </div>
                    </div>
                  </div>
                </UCard>
              </div>
            </div>
          </template>

          <template #reflex>
            <div class="space-y-4 p-4 md:p-6">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div class="max-w-2xl">
                  <p class="text-sm font-medium text-highlighted">
                    Réflexe
                  </p>
                  <p class="text-sm text-toned">
                    Lance une manche, attends le feu vert, puis clique immédiatement. Tout clic anticipé annule le run.
                  </p>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    icon="i-lucide-play"
                    color="primary"
                    size="sm"
                    label="Nouvelle manche"
                    @click="startReflexRound"
                  />
                  <UButton
                    icon="i-lucide-rotate-ccw"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    label="Reset"
                    @click="newReflexGame"
                  />
                </div>
              </div>

              <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <UCard :ui="{ body: 'p-5 sm:p-6' }">
                  <div class="space-y-5">
                    <div class="flex flex-wrap items-center gap-2">
                      <UBadge :color="reflexTone" variant="subtle">
                        {{ reflexStatus === 'ready' ? 'Clique' : reflexStatus === 'waiting' ? 'Patiente' : reflexStatus === 'done' ? 'Mesuré' : reflexStatus === 'too-soon' ? 'Trop tôt' : 'En attente' }}
                      </UBadge>
                      <UBadge v-if="reflexBest !== null" color="neutral" variant="outline">
                        Best {{ reflexBest }} ms
                      </UBadge>
                    </div>

                    <button
                      type="button"
                      class="flex min-h-72 w-full items-center justify-center rounded-3xl border text-center transition-colors"
                      :class="[
                        reflexStatus === 'ready' ? 'border-emerald-500/60 bg-emerald-500/15' : '',
                        reflexStatus === 'waiting' ? 'border-amber-500/40 bg-amber-500/10' : '',
                        reflexStatus === 'too-soon' ? 'border-rose-500/50 bg-rose-500/10' : '',
                        reflexStatus === 'done' ? 'border-sky-500/50 bg-sky-500/10' : '',
                        reflexStatus === 'idle' ? 'border-default bg-elevated/40' : ''
                      ]"
                      @click="handleReflexClick"
                    >
                      <div class="space-y-3 px-6">
                        <p class="text-sm font-medium uppercase tracking-[0.18em] text-toned">
                          Zone de clic
                        </p>
                        <p class="text-3xl font-semibold text-highlighted">
                          {{ reflexStatus === 'ready' ? 'CLIQUE' : reflexStatus === 'waiting' ? '...' : reflexStatus === 'too-soon' ? 'Trop tôt' : reflexResult !== null ? `${reflexResult} ms` : 'Prêt ?' }}
                        </p>
                        <p class="text-sm text-toned">
                          {{ reflexMessage }}
                        </p>
                      </div>
                    </button>
                  </div>
                </UCard>

                <UCard :ui="{ body: 'p-5' }">
                  <div class="space-y-3">
                    <p class="text-sm font-medium text-highlighted">
                      Stats
                    </p>

                    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      <div class="rounded-xl border border-default px-3 py-2">
                        <p class="text-xs uppercase tracking-[0.16em] text-toned">
                          Meilleur
                        </p>
                        <p class="text-lg font-semibold text-highlighted">
                          {{ reflexBest !== null ? `${reflexBest} ms` : '—' }}
                        </p>
                      </div>

                      <div class="rounded-xl border border-default px-3 py-2">
                        <p class="text-xs uppercase tracking-[0.16em] text-toned">
                          Moyenne
                        </p>
                        <p class="text-lg font-semibold text-highlighted">
                          {{ averageReflex !== null ? `${averageReflex} ms` : '—' }}
                        </p>
                      </div>
                    </div>

                    <div v-if="reflexHistory.length" class="space-y-2">
                      <p class="text-xs uppercase tracking-[0.16em] text-toned">
                        Derniers runs
                      </p>

                      <div class="flex flex-wrap gap-2">
                        <UBadge
                          v-for="value in reflexHistory"
                          :key="value"
                          color="neutral"
                          variant="subtle"
                        >
                          {{ value }} ms
                        </UBadge>
                      </div>
                    </div>
                  </div>
                </UCard>
              </div>
            </div>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>
</template>
