<script setup lang="ts">
type CellStatus = 'empty' | 'pending' | 'correct' | 'present' | 'absent'
type Cell = { letter: string, status: CellStatus }
type GameStatus = 'playing' | 'won' | 'lost'
type WordLength = 5 | 6 | 7

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
  ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
  ['ENTER', 'W', 'X', 'C', 'V', 'B', 'N', 'BACK']
]

const wordLength = ref<WordLength>(5)
const targetWord = ref('')
const guesses = ref<string[]>([])
const currentGuess = ref('')
const gameStatus = ref<GameStatus>('playing')
const message = ref<string | null>(null)
const flashInvalid = ref(false)

function normalize(input: string) {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}

function pickWord() {
  const pool = WORDS[wordLength.value]
  return pool[Math.floor(Math.random() * pool.length)] || ''
}

function newGame() {
  targetWord.value = pickWord()
  guesses.value = []
  currentGuess.value = ''
  gameStatus.value = 'playing'
  message.value = null
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

  if (gameStatus.value === 'playing') {
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
  message.value = reason
  flashInvalid.value = true
  setTimeout(() => {
    flashInvalid.value = false
  }, 400)
}

function submitGuess() {
  if (gameStatus.value !== 'playing') return
  if (currentGuess.value.length !== wordLength.value) {
    triggerInvalid(`Complète les ${wordLength.value} lettres.`)
    return
  }
  const guess = currentGuess.value
  guesses.value.push(guess)
  currentGuess.value = ''
  message.value = null

  if (guess === targetWord.value) {
    gameStatus.value = 'won'
    message.value = `Bravo ! Trouvé en ${guesses.value.length} coup${guesses.value.length > 1 ? 's' : ''}.`
    return
  }
  if (guesses.value.length >= MAX_GUESSES) {
    gameStatus.value = 'lost'
    message.value = `Perdu. Le mot était ${targetWord.value}.`
  }
}

function pressKey(key: string) {
  if (gameStatus.value !== 'playing') return
  if (key === 'ENTER') {
    submitGuess()
    return
  }
  if (key === 'BACK') {
    currentGuess.value = currentGuess.value.slice(0, -1)
    message.value = null
    return
  }
  if (currentGuess.value.length >= wordLength.value) return
  currentGuess.value += key
}

function handleKeydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return
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

onMounted(() => {
  newGame()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})

watch(wordLength, () => {
  newGame()
})
</script>

<template>
  <UDashboardPanel id="games">
    <template #header>
      <UDashboardNavbar title="Mot mystère">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #trailing>
          <div class="flex items-center gap-2">
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
              @click="newGame"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col items-center justify-start gap-6 bg-default px-4 py-6 sm:justify-center">
        <div class="flex min-h-[3rem] w-full max-w-md items-center justify-center">
          <UAlert
            v-if="message"
            :color="gameStatus === 'won' ? 'success' : gameStatus === 'lost' ? 'error' : 'neutral'"
            variant="subtle"
            :title="message"
            class="w-full"
          />
          <p v-else class="text-sm text-toned">
            Trouve le mot en {{ MAX_GUESSES }} essais. Lettres bien placées en vert, mal placées en jaune.
          </p>
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
              <template v-if="key === 'BACK'">⌫</template>
              <template v-else-if="key === 'ENTER'">Entrée</template>
              <template v-else>{{ key }}</template>
            </button>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
