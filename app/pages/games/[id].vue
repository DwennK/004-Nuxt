<script setup lang="ts">
type GameTab = 'wordle' | 'higher' | 'tic' | 'aim' | 'reflex' | 'snake' | 'tiles' | 'connect' | 'mines' | 'memory'
type CellStatus = 'empty' | 'pending' | 'correct' | 'present' | 'absent'
type Cell = { letter: string, status: CellStatus }
type GameStatus = 'playing' | 'won' | 'lost' | 'draw'
type WordLength = 5 | 6 | 7
type HigherHint = 'plus' | 'moins' | 'trouve'
type TicMark = 'X' | 'O'
type AimStatus = 'idle' | 'playing' | 'done'
type ReflexStatus = 'idle' | 'waiting' | 'ready' | 'too-soon' | 'done'
type SnakeStatus = 'idle' | 'playing' | 'won' | 'lost'
type Direction = 'up' | 'right' | 'down' | 'left'
type TileDirection = 'up' | 'right' | 'down' | 'left'
type ConnectDisc = 'player' | 'ai'
type MineCell = { mine: boolean, revealed: boolean, flagged: boolean, adjacent: number }
type MemoryCard = { id: number, value: string, label: string, icon: string, revealed: boolean, matched: boolean }

const games = [
  {
    value: 'wordle',
    label: 'Mot mystere',
    short: 'WORD',
    icon: 'i-lucide-spell-check',
    accent: 'from-success to-primary',
    color: 'success',
    category: 'Mots',
    rhythm: '2-4 min',
    description: 'Six essais pour lire les couleurs, eliminer les lettres et trouver le mot.'
  },
  {
    value: 'higher',
    label: 'Plus ou moins',
    short: '100',
    icon: 'i-lucide-binary',
    accent: 'from-info to-primary',
    color: 'info',
    category: 'Puzzle',
    rhythm: '1 min',
    description: 'Resserre la plage de 1 a 100 en huit tentatives maximum.'
  },
  {
    value: 'tic',
    label: 'Morpion',
    short: 'X/O',
    icon: 'i-lucide-grid-3x3',
    accent: 'from-warning to-primary',
    color: 'warning',
    category: 'Strategie',
    rhythm: '1 min',
    description: 'Force une ligne de trois avant que l IA ne bloque ou ne gagne.'
  },
  {
    value: 'aim',
    label: 'Precision',
    short: 'AIM',
    icon: 'i-lucide-crosshair',
    accent: 'from-error to-primary',
    color: 'error',
    category: 'Reflexes',
    rhythm: '30 s',
    description: 'Clique quinze cibles, limite les rates et baisse ton temps moyen.'
  },
  {
    value: 'reflex',
    label: 'Reflexe',
    short: 'MS',
    icon: 'i-lucide-timer-reset',
    accent: 'from-primary to-info',
    color: 'primary',
    category: 'Reflexes',
    rhythm: '10 s',
    description: 'Attends le signal vert, puis clique sans anticiper.'
  },
  {
    value: 'snake',
    label: 'Snake',
    short: 'RUN',
    icon: 'i-lucide-route',
    accent: 'from-success to-info',
    color: 'success',
    category: 'Arcade',
    rhythm: '3 min',
    description: 'Mange, grandis, evite les murs et garde la trajectoire propre.'
  },
  {
    value: 'tiles',
    label: '2048',
    short: '2K',
    icon: 'i-lucide-layout-grid',
    accent: 'from-warning to-success',
    color: 'warning',
    category: 'Puzzle',
    rhythm: '5 min',
    description: 'Fusionne les tuiles, garde un coin fort et vise 2048.'
  },
  {
    value: 'connect',
    label: 'Puissance 4',
    short: '4',
    icon: 'i-lucide-circle-dot',
    accent: 'from-error to-warning',
    color: 'error',
    category: 'Strategie',
    rhythm: '2 min',
    description: 'Depose les disques et aligne quatre cases avant l IA.'
  },
  {
    value: 'mines',
    label: 'Demineur',
    short: 'MINE',
    icon: 'i-lucide-bomb',
    accent: 'from-muted to-primary',
    color: 'neutral',
    category: 'Puzzle',
    rhythm: '4 min',
    description: 'Premier clic protege, drapeaux au clic droit, mines a eviter.'
  },
  {
    value: 'memory',
    label: 'Memoire',
    short: 'MEM',
    icon: 'i-lucide-brain',
    accent: 'from-info to-success',
    color: 'info',
    category: 'Memoire',
    rhythm: '2 min',
    description: 'Retrouve les paires tech avec le moins de coups possible.'
  }
] satisfies {
  value: GameTab
  label: string
  short: string
  icon: string
  accent: string
  color: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  category: string
  rhythm: string
  description: string
}[]

function isGameTab(value: unknown): value is GameTab {
  return typeof value === 'string' && games.some(game => game.value === value)
}

const route = useRoute()
const routeGameId = computed(() => {
  const id = route.params.id
  return Array.isArray(id) ? id[0] : id
})

if (!isGameTab(routeGameId.value)) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Jeu introuvable'
  })
}

const selectedGame = computed<GameTab>(() => isGameTab(routeGameId.value) ? routeGameId.value : 'wordle')
const selectedGameMeta = computed(() => games.find(game => game.value === selectedGame.value) || games[0]!)
const clockNow = ref(0)
let clockTimer: number | undefined

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
const wordleStats = ref({ played: 0, wins: 0, streak: 0, best: 0 })

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

function finishWordle(status: GameStatus) {
  wordleStatus.value = status
  wordleStats.value.played += 1

  if (status === 'won') {
    wordleStats.value.wins += 1
    wordleStats.value.streak += 1
    wordleStats.value.best = wordleStats.value.best
      ? Math.min(wordleStats.value.best, guesses.value.length)
      : guesses.value.length
  } else {
    wordleStats.value.streak = 0
  }
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
    triggerInvalid(`Complete les ${wordLength.value} lettres.`)
    return
  }

  const guess = currentGuess.value
  guesses.value.push(guess)
  currentGuess.value = ''
  wordleMessage.value = null

  if (guess === targetWord.value) {
    finishWordle('won')
    wordleMessage.value = `Bravo. Trouve en ${guesses.value.length} coup${guesses.value.length > 1 ? 's' : ''}.`
    return
  }

  if (guesses.value.length >= MAX_GUESSES) {
    finishWordle('lost')
    wordleMessage.value = `Perdu. Le mot etait ${targetWord.value}.`
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

function cellClass(status: CellStatus) {
  if (status === 'correct') return 'bg-success text-inverted border-success shadow-sm'
  if (status === 'present') return 'bg-warning text-inverted border-warning shadow-sm'
  if (status === 'absent') return 'bg-muted text-muted border-muted'
  if (status === 'pending') return 'bg-default border-primary/40 text-highlighted shadow-sm'
  return 'bg-elevated/50 border-default/70 text-muted'
}

function keyClass(status: CellStatus | undefined) {
  if (status === 'correct') return 'bg-success text-inverted hover:bg-success/90'
  if (status === 'present') return 'bg-warning text-inverted hover:bg-warning/90'
  if (status === 'absent') return 'bg-muted text-muted hover:bg-muted/90'
  return 'bg-elevated text-default hover:bg-accented'
}

const wordleWinRate = computed(() => {
  if (!wordleStats.value.played) return 0
  return Math.round((wordleStats.value.wins / wordleStats.value.played) * 100)
})

const higherTarget = ref(0)
const higherInput = ref('')
const higherHistory = ref<{ value: number, hint: HigherHint }[]>([])
const higherStatus = ref<GameStatus>('playing')
const higherMessage = ref('Trouve le nombre cache entre 1 et 100 en 8 essais maximum.')
const higherWins = ref(0)
const HIGHER_MAX_ATTEMPTS = 8

function newHigherGame() {
  higherTarget.value = Math.floor(Math.random() * 100) + 1
  higherInput.value = ''
  higherHistory.value = []
  higherStatus.value = 'playing'
  higherMessage.value = 'Trouve le nombre cache entre 1 et 100 en 8 essais maximum.'
}

const higherRemaining = computed(() => HIGHER_MAX_ATTEMPTS - higherHistory.value.length)
const higherLow = computed(() => {
  const lows = higherHistory.value.filter(entry => entry.hint === 'plus').map(entry => entry.value + 1)
  return Math.max(1, ...lows)
})
const higherHigh = computed(() => {
  const highs = higherHistory.value.filter(entry => entry.hint === 'moins').map(entry => entry.value - 1)
  return Math.min(100, ...highs)
})

function submitHigherGuess() {
  if (higherStatus.value !== 'playing') return

  const value = Number.parseInt(higherInput.value, 10)

  if (!Number.isInteger(value) || value < 1 || value > 100) {
    higherMessage.value = 'Entre un nombre entier entre 1 et 100.'
    return
  }

  if (higherHistory.value.some(entry => entry.value === value)) {
    higherMessage.value = 'Ce nombre a deja ete tente.'
    return
  }

  if (value === higherTarget.value) {
    higherHistory.value.unshift({ value, hint: 'trouve' })
    higherStatus.value = 'won'
    higherWins.value += 1
    higherMessage.value = `Bien joue. ${value} etait le bon nombre.`
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
const ticMessage = ref('Tu joues X. Aligne 3 symboles avant l IA.')
const ticStatus = ref<GameStatus>('playing')
const ticScores = ref({ player: 0, ai: 0, draw: 0 })
const ticWinningLine = ref<number[]>([])
let ticTimer: number | undefined

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
  for (const line of ticWinningLines) {
    const [a, b, c] = line
    const first = board[a]

    if (first && first === board[b] && first === board[c]) {
      ticWinningLine.value = line
      return first
    }
  }

  return null
}

function newTicGame() {
  if (ticTimer) window.clearTimeout(ticTimer)
  ticBoard.value = Array(9).fill(null)
  ticCurrent.value = 'X'
  ticStatus.value = 'playing'
  ticMessage.value = 'Tu joues X. Aligne 3 symboles avant l IA.'
  ticWinningLine.value = []
}

function maybeEndTicRound(board: (TicMark | null)[]) {
  ticWinningLine.value = []
  const winner = getTicWinner(board)

  if (winner === 'X') {
    ticStatus.value = 'won'
    ticScores.value.player += 1
    ticMessage.value = 'Bien joue, tu as gagne.'
    return true
  }

  if (winner === 'O') {
    ticStatus.value = 'lost'
    ticScores.value.ai += 1
    ticMessage.value = 'L IA a gagne cette manche.'
    return true
  }

  if (board.every(Boolean)) {
    ticStatus.value = 'draw'
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
    ticWinningLine.value = []
    if (getTicWinner(next) === 'O') return index
  }

  for (const index of openIndexes) {
    const next = [...board]
    next[index] = 'X'
    ticWinningLine.value = []
    if (getTicWinner(next) === 'X') return index
  }

  if (openIndexes.includes(4)) return 4

  const corners = [0, 2, 6, 8].filter(index => openIndexes.includes(index))
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)]!

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
  ticMessage.value = 'L IA reflechit...'

  ticTimer = window.setTimeout(() => {
    if (ticStatus.value !== 'playing') return

    const aiIndex = chooseTicMove(ticBoard.value)
    const aiBoard = [...ticBoard.value]
    aiBoard[aiIndex] = 'O'
    ticBoard.value = aiBoard

    if (maybeEndTicRound(aiBoard)) return

    ticCurrent.value = 'X'
    ticMessage.value = 'A toi.'
  }, 220)
}

const AIM_TOTAL_TARGETS = 15
const aimStatus = ref<AimStatus>('idle')
const aimHits = ref(0)
const aimMisses = ref(0)
const aimMessage = ref('Clique 15 cibles le plus vite possible.')
const aimStartedAt = ref<number | null>(null)
const aimFinishedAt = ref<number | null>(null)
const aimTarget = ref({ x: 24, y: 28, size: 56 })
const aimBest = ref<number | null>(null)
const aimHistory = ref<number[]>([])

function placeAimTarget() {
  aimTarget.value = {
    x: 8 + Math.random() * 84,
    y: 12 + Math.random() * 70,
    size: 38 + Math.round(Math.random() * 24)
  }
}

function newAimGame() {
  aimStatus.value = 'idle'
  aimHits.value = 0
  aimMisses.value = 0
  aimStartedAt.value = null
  aimFinishedAt.value = null
  aimMessage.value = 'Clique 15 cibles le plus vite possible.'
  placeAimTarget()
}

function startAimGame() {
  aimStatus.value = 'playing'
  aimHits.value = 0
  aimMisses.value = 0
  aimStartedAt.value = performance.now()
  aimFinishedAt.value = null
  aimMessage.value = 'Vise juste et enchaine.'
  placeAimTarget()
}

function missAimTarget() {
  if (aimStatus.value === 'idle') {
    startAimGame()
    return
  }

  if (aimStatus.value !== 'playing') return
  aimMisses.value += 1
  aimMessage.value = 'Rate. Continue.'
}

function hitAimTarget() {
  if (aimStatus.value === 'idle') {
    startAimGame()
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
    aimMessage.value = `Termine en ${duration} ms.`
    return
  }

  placeAimTarget()
}

const aimDuration = computed(() => {
  if (aimStartedAt.value === null) return null
  const end = aimFinishedAt.value ?? clockNow.value
  return Math.round(end - aimStartedAt.value)
})

const aimAccuracy = computed(() => {
  const total = aimHits.value + aimMisses.value
  if (!total) return 100
  return Math.round((aimHits.value / total) * 100)
})

const aimAveragePerTarget = computed(() => {
  if (!aimHits.value || aimStartedAt.value === null) return null
  const elapsed = (aimFinishedAt.value ?? clockNow.value) - aimStartedAt.value
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
  reflexMessage.value = 'Prepare-toi... ne clique pas trop tot.'

  reflexTimer = window.setTimeout(() => {
    reflexStatus.value = 'ready'
    reflexStartedAt = performance.now()
    reflexMessage.value = 'Maintenant.'
  }, 1200 + Math.random() * 2200)
}

function handleReflexClick() {
  if (reflexStatus.value === 'idle' || reflexStatus.value === 'done' || reflexStatus.value === 'too-soon') {
    startReflexRound()
    return
  }

  if (reflexStatus.value === 'waiting') {
    clearReflexTimer()
    reflexStatus.value = 'too-soon'
    reflexMessage.value = 'Trop tot. Relance la manche.'
    reflexResult.value = null
    return
  }

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

const SNAKE_SIZE = 12
const snake = ref([{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }])
const snakeFood = ref({ x: 9, y: 6 })
const snakeDirection = ref<Direction>('right')
const snakeNextDirection = ref<Direction>('right')
const snakeStatus = ref<SnakeStatus>('idle')
const snakeScore = ref(0)
const snakeBest = ref(0)
let snakeTimer: number | undefined

function snakeIndex(x: number, y: number) {
  return y * SNAKE_SIZE + x
}

const snakeCells = computed(() => {
  const body = new Map<number, number>()
  snake.value.forEach((part, index) => body.set(snakeIndex(part.x, part.y), index))
  return Array.from({ length: SNAKE_SIZE * SNAKE_SIZE }, (_, index) => {
    const x = index % SNAKE_SIZE
    const y = Math.floor(index / SNAKE_SIZE)
    const bodyIndex = body.get(index)
    return {
      x,
      y,
      food: snakeFood.value.x === x && snakeFood.value.y === y,
      head: bodyIndex === 0,
      body: bodyIndex !== undefined && bodyIndex > 0
    }
  })
})

function stopSnakeTimer() {
  if (snakeTimer) {
    window.clearInterval(snakeTimer)
    snakeTimer = undefined
  }
}

function placeSnakeFood() {
  const occupied = new Set(snake.value.map(part => snakeIndex(part.x, part.y)))
  const open = Array.from({ length: SNAKE_SIZE * SNAKE_SIZE }, (_, index) => index).filter(index => !occupied.has(index))

  if (!open.length) {
    snakeStatus.value = 'won'
    stopSnakeTimer()
    return
  }

  const index = open[Math.floor(Math.random() * open.length)]!
  snakeFood.value = { x: index % SNAKE_SIZE, y: Math.floor(index / SNAKE_SIZE) }
}

function newSnakeGame() {
  stopSnakeTimer()
  snake.value = [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }]
  snakeDirection.value = 'right'
  snakeNextDirection.value = 'right'
  snakeStatus.value = 'idle'
  snakeScore.value = 0
  snakeFood.value = { x: 9, y: 6 }
}

function startSnakeGame() {
  if (snakeStatus.value === 'playing') return
  if (snakeStatus.value === 'lost' || snakeStatus.value === 'won') newSnakeGame()
  snakeStatus.value = 'playing'
  snakeTimer = window.setInterval(stepSnake, 150)
}

function setSnakeDirection(direction: Direction) {
  const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
  if (opposite[snakeDirection.value] === direction) return
  snakeNextDirection.value = direction
  if (snakeStatus.value === 'idle') startSnakeGame()
}

function stepSnake() {
  if (snakeStatus.value !== 'playing') return

  snakeDirection.value = snakeNextDirection.value
  const head = snake.value[0]!
  const delta: Record<Direction, { x: number, y: number }> = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }
  }
  const next = { x: head.x + delta[snakeDirection.value].x, y: head.y + delta[snakeDirection.value].y }
  const ate = next.x === snakeFood.value.x && next.y === snakeFood.value.y
  const bodyToCheck = ate ? snake.value : snake.value.slice(0, -1)

  if (
    next.x < 0
    || next.y < 0
    || next.x >= SNAKE_SIZE
    || next.y >= SNAKE_SIZE
    || bodyToCheck.some(part => part.x === next.x && part.y === next.y)
  ) {
    snakeStatus.value = 'lost'
    snakeBest.value = Math.max(snakeBest.value, snakeScore.value)
    stopSnakeTimer()
    return
  }

  snake.value = ate ? [next, ...snake.value] : [next, ...snake.value.slice(0, -1)]

  if (ate) {
    snakeScore.value += 10
    snakeBest.value = Math.max(snakeBest.value, snakeScore.value)
    placeSnakeFood()
  }
}

const tileBoard = ref<number[]>(Array(16).fill(0))
const tileScore = ref(0)
const tileBest = ref(0)
const tileStatus = ref<GameStatus>('playing')
const tileWonOnce = ref(false)

function emptyTileIndexes(board = tileBoard.value) {
  return board.map((value, index) => value ? null : index).filter((value): value is number => value !== null)
}

function spawnTile(board = tileBoard.value) {
  const empty = emptyTileIndexes(board)
  if (!empty.length) return board
  const next = [...board]
  const index = empty[Math.floor(Math.random() * empty.length)]!
  next[index] = Math.random() < 0.9 ? 2 : 4
  return next
}

function newTileGame() {
  tileBoard.value = spawnTile(spawnTile(Array(16).fill(0)))
  tileScore.value = 0
  tileStatus.value = 'playing'
  tileWonOnce.value = false
}

function mergeLine(line: number[]) {
  const compact = line.filter(Boolean)
  const merged: number[] = []
  let gained = 0

  for (let i = 0; i < compact.length; i++) {
    if (compact[i] === compact[i + 1]) {
      const value = compact[i]! * 2
      merged.push(value)
      gained += value
      i += 1
    } else {
      merged.push(compact[i]!)
    }
  }

  while (merged.length < 4) merged.push(0)
  return { line: merged, gained }
}

function moveTiles(direction: TileDirection) {
  if (tileStatus.value !== 'playing') return

  const before = [...tileBoard.value]
  const next = Array(16).fill(0) as number[]
  let gained = 0

  for (let i = 0; i < 4; i++) {
    const line = direction === 'left' || direction === 'right'
      ? [0, 1, 2, 3].map(x => tileBoard.value[i * 4 + x]!)
      : [0, 1, 2, 3].map(y => tileBoard.value[y * 4 + i]!)
    const oriented = direction === 'right' || direction === 'down' ? [...line].reverse() : line
    const merged = mergeLine(oriented)
    const finalLine = direction === 'right' || direction === 'down' ? [...merged.line].reverse() : merged.line
    gained += merged.gained

    for (let j = 0; j < 4; j++) {
      if (direction === 'left' || direction === 'right') {
        next[i * 4 + j] = finalLine[j]!
      } else {
        next[j * 4 + i] = finalLine[j]!
      }
    }
  }

  if (next.every((value, index) => value === before[index])) return

  tileBoard.value = spawnTile(next)
  tileScore.value += gained
  tileBest.value = Math.max(tileBest.value, tileScore.value)

  if (!tileWonOnce.value && tileBoard.value.some(value => value >= 2048)) {
    tileWonOnce.value = true
    tileStatus.value = 'won'
    return
  }

  if (!canMoveTiles()) {
    tileStatus.value = 'lost'
  }
}

function canMoveTiles(board = tileBoard.value) {
  if (emptyTileIndexes(board).length) return true

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const value = board[y * 4 + x]
      if (x < 3 && value === board[y * 4 + x + 1]) return true
      if (y < 3 && value === board[(y + 1) * 4 + x]) return true
    }
  }

  return false
}

function continueTileGame() {
  if (tileStatus.value === 'won') tileStatus.value = 'playing'
}

function tileClass(value: number) {
  if (!value) return 'bg-white/45 dark:bg-white/5 text-transparent'
  if (value <= 4) return 'bg-elevated text-highlighted'
  if (value <= 16) return 'bg-warning/25 text-highlighted'
  if (value <= 64) return 'bg-warning text-inverted'
  if (value <= 256) return 'bg-primary/35 text-highlighted'
  if (value <= 1024) return 'bg-success text-inverted'
  return 'bg-info text-inverted'
}

const CONNECT_ROWS = 6
const CONNECT_COLS = 7
const connectBoard = ref<(ConnectDisc | null)[]>(Array(CONNECT_ROWS * CONNECT_COLS).fill(null))
const connectStatus = ref<GameStatus>('playing')
const connectMessage = ref('Depose un disque. Aligne 4 avant l IA.')
const connectScores = ref({ player: 0, ai: 0, draw: 0 })
const connectWinningLine = ref<number[]>([])
let connectTimer: number | undefined

function newConnectGame() {
  if (connectTimer) window.clearTimeout(connectTimer)
  connectBoard.value = Array(CONNECT_ROWS * CONNECT_COLS).fill(null)
  connectStatus.value = 'playing'
  connectMessage.value = 'Depose un disque. Aligne 4 avant l IA.'
  connectWinningLine.value = []
}

function connectIndex(row: number, col: number) {
  return row * CONNECT_COLS + col
}

function availableRow(board: (ConnectDisc | null)[], col: number) {
  for (let row = CONNECT_ROWS - 1; row >= 0; row--) {
    if (!board[connectIndex(row, col)]) return row
  }
  return -1
}

function findConnectWinner(board: (ConnectDisc | null)[]) {
  const directions = [
    { r: 0, c: 1 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
    { r: 1, c: -1 }
  ]

  for (let row = 0; row < CONNECT_ROWS; row++) {
    for (let col = 0; col < CONNECT_COLS; col++) {
      const start = board[connectIndex(row, col)]
      if (!start) continue

      for (const direction of directions) {
        const line = [connectIndex(row, col)]

        for (let step = 1; step < 4; step++) {
          const nextRow = row + direction.r * step
          const nextCol = col + direction.c * step
          if (nextRow < 0 || nextRow >= CONNECT_ROWS || nextCol < 0 || nextCol >= CONNECT_COLS) break
          const index = connectIndex(nextRow, nextCol)
          if (board[index] !== start) break
          line.push(index)
        }

        if (line.length === 4) {
          connectWinningLine.value = line
          return start
        }
      }
    }
  }

  return null
}

function maybeEndConnect(board: (ConnectDisc | null)[]) {
  connectWinningLine.value = []
  const winner = findConnectWinner(board)

  if (winner === 'player') {
    connectStatus.value = 'won'
    connectScores.value.player += 1
    connectMessage.value = 'Puissance 4. Tu gagnes.'
    return true
  }

  if (winner === 'ai') {
    connectStatus.value = 'lost'
    connectScores.value.ai += 1
    connectMessage.value = 'L IA aligne 4 disques.'
    return true
  }

  if (board.every(Boolean)) {
    connectStatus.value = 'draw'
    connectScores.value.draw += 1
    connectMessage.value = 'Grille pleine. Egalite.'
    return true
  }

  return false
}

function chooseConnectColumn(board: (ConnectDisc | null)[]) {
  const open = Array.from({ length: CONNECT_COLS }, (_, col) => col).filter(col => availableRow(board, col) >= 0)

  for (const disc of ['ai', 'player'] satisfies ConnectDisc[]) {
    for (const col of open) {
      const row = availableRow(board, col)
      const next = [...board]
      next[connectIndex(row, col)] = disc
      connectWinningLine.value = []
      if (findConnectWinner(next) === disc) return col
    }
  }

  const preferred = [3, 2, 4, 1, 5, 0, 6].filter(col => open.includes(col))
  return preferred[Math.floor(Math.random() * preferred.length)]!
}

function dropConnect(col: number, disc: ConnectDisc) {
  const row = availableRow(connectBoard.value, col)
  if (row < 0) return false
  const next = [...connectBoard.value]
  next[connectIndex(row, col)] = disc
  connectBoard.value = next
  return true
}

function playConnect(col: number) {
  if (connectStatus.value !== 'playing') return
  if (!dropConnect(col, 'player')) return
  if (maybeEndConnect(connectBoard.value)) return

  connectMessage.value = 'L IA joue...'
  connectTimer = window.setTimeout(() => {
    if (connectStatus.value !== 'playing') return
    dropConnect(chooseConnectColumn(connectBoard.value), 'ai')
    if (maybeEndConnect(connectBoard.value)) return
    connectMessage.value = 'A toi.'
  }, 260)
}

const MINE_SIZE = 8
const MINE_COUNT = 10
const minesBoard = ref<MineCell[]>([])
const minesStatus = ref<GameStatus>('playing')
const minesReady = ref(false)
const minesMessage = ref('Premier clic garanti. Evite les mines, marque les cases suspectes.')
const minesStartedAt = ref<number | null>(null)
const minesFinishedAt = ref<number | null>(null)
const minesWins = ref(0)

function emptyMineBoard() {
  return Array.from({ length: MINE_SIZE * MINE_SIZE }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    adjacent: 0
  }))
}

function newMinesGame() {
  minesBoard.value = emptyMineBoard()
  minesStatus.value = 'playing'
  minesReady.value = false
  minesMessage.value = 'Premier clic garanti. Evite les mines, marque les cases suspectes.'
  minesStartedAt.value = null
  minesFinishedAt.value = null
}

function mineNeighbors(index: number) {
  const x = index % MINE_SIZE
  const y = Math.floor(index / MINE_SIZE)
  const out: number[] = []

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= MINE_SIZE || ny >= MINE_SIZE) continue
      out.push(ny * MINE_SIZE + nx)
    }
  }

  return out
}

function prepareMines(firstIndex: number) {
  const board = emptyMineBoard()
  const blocked = new Set([firstIndex, ...mineNeighbors(firstIndex)])
  const candidates = board.map((_, index) => index).filter(index => !blocked.has(index))

  for (let i = 0; i < MINE_COUNT; i++) {
    const pick = Math.floor(Math.random() * candidates.length)
    const index = candidates.splice(pick, 1)[0]!
    board[index]!.mine = true
  }

  board.forEach((cell, index) => {
    cell.adjacent = mineNeighbors(index).filter(next => board[next]!.mine).length
  })

  minesBoard.value = board
  minesReady.value = true
  minesStartedAt.value = performance.now()
}

function revealMineArea(index: number, board = [...minesBoard.value]) {
  const stack = [index]

  while (stack.length) {
    const current = stack.pop()!
    const cell = board[current]!
    if (cell.revealed || cell.flagged) continue

    cell.revealed = true

    if (cell.adjacent === 0 && !cell.mine) {
      for (const next of mineNeighbors(current)) {
        if (!board[next]!.revealed && !board[next]!.flagged) stack.push(next)
      }
    }
  }

  minesBoard.value = board
}

function checkMinesWin() {
  const safeRevealed = minesBoard.value.filter(cell => !cell.mine && cell.revealed).length
  if (safeRevealed !== MINE_SIZE * MINE_SIZE - MINE_COUNT) return
  minesStatus.value = 'won'
  minesFinishedAt.value = performance.now()
  minesWins.value += 1
  minesMessage.value = 'Terrain nettoye.'
}

function revealMine(index: number) {
  if (minesStatus.value !== 'playing') return
  if (!minesReady.value) prepareMines(index)
  const cell = minesBoard.value[index]!
  if (cell.flagged || cell.revealed) return

  if (cell.mine) {
    minesBoard.value = minesBoard.value.map(mineCell => mineCell.mine ? { ...mineCell, revealed: true } : mineCell)
    minesStatus.value = 'lost'
    minesFinishedAt.value = performance.now()
    minesMessage.value = 'Boom. Nouvelle grille ?'
    return
  }

  revealMineArea(index)
  checkMinesWin()
}

function toggleMineFlag(index: number) {
  if (minesStatus.value !== 'playing') return
  const cell = minesBoard.value[index]!
  if (cell.revealed) return
  if (!cell.flagged && minesFlagsLeft.value <= 0) {
    minesMessage.value = 'Tous les drapeaux sont deja poses.'
    return
  }
  const next = [...minesBoard.value]
  next[index] = { ...cell, flagged: !cell.flagged }
  minesBoard.value = next
}

const minesFlagsLeft = computed(() => MINE_COUNT - minesBoard.value.filter(cell => cell.flagged).length)
const minesElapsed = computed(() => {
  if (minesStartedAt.value === null) return 0
  return Math.round(((minesFinishedAt.value ?? clockNow.value) - minesStartedAt.value) / 1000)
})

const MEMORY_VALUES = [
  { value: 'ram', label: 'RAM', icon: 'i-lucide-memory-stick' },
  { value: 'usb', label: 'USB', icon: 'i-lucide-usb' },
  { value: 'cpu', label: 'CPU', icon: 'i-lucide-cpu' },
  { value: 'ssd', label: 'SSD', icon: 'i-lucide-hard-drive' },
  { value: 'sim', label: 'SIM', icon: 'i-lucide-sim-card' },
  { value: 'lcd', label: 'LCD', icon: 'i-lucide-monitor' },
  { value: 'wifi', label: 'WiFi', icon: 'i-lucide-wifi' },
  { value: 'gpu', label: 'GPU', icon: 'i-lucide-circuit-board' }
]
const memoryCards = ref<MemoryCard[]>([])
const memoryOpen = ref<number[]>([])
const memoryMoves = ref(0)
const memoryStatus = ref<GameStatus>('playing')
const memoryBest = ref<number | null>(null)
const memoryMessage = ref('Retourne deux cartes et retrouve toutes les paires.')
let memoryTimer: number | undefined

function shuffle<T>(items: T[]) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function newMemoryGame() {
  if (memoryTimer) window.clearTimeout(memoryTimer)
  memoryCards.value = shuffle([...MEMORY_VALUES, ...MEMORY_VALUES]).map((item, index) => ({
    id: index,
    value: item.value,
    label: item.label,
    icon: item.icon,
    revealed: false,
    matched: false
  }))
  memoryOpen.value = []
  memoryMoves.value = 0
  memoryStatus.value = 'playing'
  memoryMessage.value = 'Retourne deux cartes et retrouve toutes les paires.'
}

function flipMemoryCard(index: number) {
  if (memoryStatus.value !== 'playing') return
  if (memoryOpen.value.length >= 2) return
  const card = memoryCards.value[index]!
  if (card.revealed || card.matched) return

  const next = [...memoryCards.value]
  next[index] = { ...card, revealed: true }
  memoryCards.value = next
  memoryOpen.value = [...memoryOpen.value, index]

  if (memoryOpen.value.length !== 2) return

  memoryMoves.value += 1
  const [firstIndex, secondIndex] = memoryOpen.value
  const first = memoryCards.value[firstIndex!]!
  const second = memoryCards.value[secondIndex!]!

  if (first.value === second.value) {
    memoryCards.value = memoryCards.value.map((item, itemIndex) => {
      if (itemIndex === firstIndex || itemIndex === secondIndex) return { ...item, matched: true }
      return item
    })
    memoryOpen.value = []
    memoryMessage.value = 'Paire trouvee.'

    if (memoryCards.value.every(item => item.matched)) {
      memoryStatus.value = 'won'
      memoryBest.value = memoryBest.value === null ? memoryMoves.value : Math.min(memoryBest.value, memoryMoves.value)
      memoryMessage.value = `Grille terminee en ${memoryMoves.value} coups.`
    }
    return
  }

  memoryMessage.value = 'Pas la bonne paire.'
  memoryTimer = window.setTimeout(() => {
    memoryCards.value = memoryCards.value.map((item, itemIndex) => {
      if (itemIndex === firstIndex || itemIndex === secondIndex) return { ...item, revealed: false }
      return item
    })
    memoryOpen.value = []
  }, 650)
}

const higherTone = computed(() => {
  if (higherStatus.value === 'won') return 'success'
  if (higherStatus.value === 'lost') return 'error'
  return 'neutral'
})

const gameProgress = computed(() => {
  if (selectedGame.value === 'wordle') return Math.round((guesses.value.length / MAX_GUESSES) * 100)
  if (selectedGame.value === 'higher') return Math.round((higherHistory.value.length / HIGHER_MAX_ATTEMPTS) * 100)
  if (selectedGame.value === 'aim') return Math.round((aimHits.value / AIM_TOTAL_TARGETS) * 100)
  if (selectedGame.value === 'snake') return Math.min(100, Math.round((snake.value.length / (SNAKE_SIZE * SNAKE_SIZE)) * 100))
  if (selectedGame.value === 'tiles') return Math.min(100, Math.round((Math.log2(Math.max(...tileBoard.value, 2)) / 11) * 100))
  if (selectedGame.value === 'connect') return Math.round((connectBoard.value.filter(Boolean).length / connectBoard.value.length) * 100)
  if (selectedGame.value === 'mines') {
    const safe = MINE_SIZE * MINE_SIZE - MINE_COUNT
    return Math.round((minesBoard.value.filter(cell => !cell.mine && cell.revealed).length / safe) * 100)
  }
  if (selectedGame.value === 'memory') return Math.round((memoryCards.value.filter(card => card.matched).length / memoryCards.value.length) * 100)
  return 0
})

const gameStatus = computed(() => {
  if (selectedGame.value === 'wordle') return wordleStatus.value
  if (selectedGame.value === 'higher') return higherStatus.value
  if (selectedGame.value === 'tic') return ticStatus.value
  if (selectedGame.value === 'aim') return aimStatus.value === 'done' ? 'won' : 'playing'
  if (selectedGame.value === 'reflex') return reflexStatus.value === 'done' ? 'won' : reflexStatus.value === 'too-soon' ? 'lost' : 'playing'
  if (selectedGame.value === 'snake') return snakeStatus.value === 'idle' ? 'playing' : snakeStatus.value
  if (selectedGame.value === 'tiles') return tileStatus.value
  if (selectedGame.value === 'connect') return connectStatus.value
  if (selectedGame.value === 'mines') return minesStatus.value
  return memoryStatus.value
})

const gameStatusColor = computed(() => {
  if (gameStatus.value === 'won') return 'success'
  if (gameStatus.value === 'lost') return 'error'
  if (gameStatus.value === 'draw') return 'warning'
  return selectedGameMeta.value.color
})

const gameStatusLabel = computed(() => {
  if (gameStatus.value === 'won') return selectedGame.value === 'aim' || selectedGame.value === 'reflex' ? 'Run termine' : 'Victoire'
  if (gameStatus.value === 'lost') return 'A retenter'
  if (gameStatus.value === 'draw') return 'Egalite'
  if (selectedGame.value === 'snake' && snakeStatus.value === 'idle') return 'Pret'
  if (selectedGame.value === 'aim' && aimStatus.value === 'idle') return 'Pret'
  if (selectedGame.value === 'reflex' && reflexStatus.value === 'idle') return 'Pret'
  return 'En cours'
})

const gameMessage = computed(() => {
  if (selectedGame.value === 'wordle') return wordleMessage.value || 'Trouve le mot en six essais. Les couleurs te donnent la position des lettres.'
  if (selectedGame.value === 'higher') return higherMessage.value
  if (selectedGame.value === 'tic') return ticMessage.value
  if (selectedGame.value === 'aim') return aimMessage.value
  if (selectedGame.value === 'reflex') return reflexMessage.value
  if (selectedGame.value === 'snake') {
    if (snakeStatus.value === 'lost') return 'Collision. Relance pour battre ton score.'
    if (snakeStatus.value === 'won') return 'Plateau complet.'
    return 'Fleches ou ZQSD. Le premier mouvement lance la partie.'
  }
  if (selectedGame.value === 'tiles') return tileStatus.value === 'won' ? '2048 atteint. Tu peux continuer.' : tileStatus.value === 'lost' ? 'Plus aucun mouvement disponible.' : 'Fusionne les tuiles avec les fleches ou ZQSD.'
  if (selectedGame.value === 'connect') return connectMessage.value
  if (selectedGame.value === 'mines') return minesMessage.value
  return memoryMessage.value
})

const gameStats = computed(() => {
  if (selectedGame.value === 'wordle') {
    return [
      { label: 'Essais', value: `${guesses.value.length}/${MAX_GUESSES}` },
      { label: 'Winrate', value: `${wordleWinRate.value}%` },
      { label: 'Serie', value: String(wordleStats.value.streak) },
      { label: 'Best', value: wordleStats.value.best ? String(wordleStats.value.best) : '-' }
    ]
  }

  if (selectedGame.value === 'higher') {
    return [
      { label: 'Essais', value: `${higherHistory.value.length}/${HIGHER_MAX_ATTEMPTS}` },
      { label: 'Plage', value: `${higherLow.value}-${higherHigh.value}` },
      { label: 'Restants', value: String(higherRemaining.value) },
      { label: 'Victoires', value: String(higherWins.value) }
    ]
  }

  if (selectedGame.value === 'tic') {
    return [
      { label: 'Toi', value: String(ticScores.value.player) },
      { label: 'IA', value: String(ticScores.value.ai) },
      { label: 'Nuls', value: String(ticScores.value.draw) },
      { label: 'Tour', value: ticCurrent.value }
    ]
  }

  if (selectedGame.value === 'aim') {
    return [
      { label: 'Cibles', value: `${aimHits.value}/${AIM_TOTAL_TARGETS}` },
      { label: 'Precision', value: `${aimAccuracy.value}%` },
      { label: 'Temps', value: aimDuration.value !== null ? `${aimDuration.value} ms` : '-' },
      { label: 'Moyenne', value: aimAveragePerTarget.value !== null ? `${aimAveragePerTarget.value} ms` : '-' }
    ]
  }

  if (selectedGame.value === 'reflex') {
    return [
      { label: 'Dernier', value: reflexResult.value !== null ? `${reflexResult.value} ms` : '-' },
      { label: 'Best', value: reflexBest.value !== null ? `${reflexBest.value} ms` : '-' },
      { label: 'Moyenne', value: averageReflex.value !== null ? `${averageReflex.value} ms` : '-' },
      { label: 'Runs', value: String(reflexHistory.value.length) }
    ]
  }

  if (selectedGame.value === 'snake') {
    return [
      { label: 'Score', value: String(snakeScore.value) },
      { label: 'Best', value: String(snakeBest.value) },
      { label: 'Longueur', value: String(snake.value.length) },
      { label: 'Etat', value: snakeStatus.value === 'playing' ? 'Live' : snakeStatus.value === 'idle' ? 'Pret' : snakeStatus.value }
    ]
  }

  if (selectedGame.value === 'tiles') {
    return [
      { label: 'Score', value: String(tileScore.value) },
      { label: 'Best', value: String(tileBest.value) },
      { label: 'Max', value: String(Math.max(...tileBoard.value)) },
      { label: 'Cases libres', value: String(emptyTileIndexes().length) }
    ]
  }

  if (selectedGame.value === 'connect') {
    return [
      { label: 'Toi', value: String(connectScores.value.player) },
      { label: 'IA', value: String(connectScores.value.ai) },
      { label: 'Nuls', value: String(connectScores.value.draw) },
      { label: 'Disques', value: String(connectBoard.value.filter(Boolean).length) }
    ]
  }

  if (selectedGame.value === 'mines') {
    return [
      { label: 'Drapeaux', value: String(minesFlagsLeft.value) },
      { label: 'Temps', value: `${minesElapsed.value} s` },
      { label: 'Victoires', value: String(minesWins.value) },
      { label: 'Ouvertes', value: String(minesBoard.value.filter(cell => cell.revealed).length) }
    ]
  }

  return [
    { label: 'Coups', value: String(memoryMoves.value) },
    { label: 'Paires', value: `${memoryCards.value.filter(card => card.matched).length / 2}/${MEMORY_VALUES.length}` },
    { label: 'Best', value: memoryBest.value !== null ? String(memoryBest.value) : '-' },
    { label: 'Ouvertes', value: String(memoryOpen.value.length) }
  ]
})

const controlHints = computed(() => {
  if (selectedGame.value === 'wordle') return ['Clavier physique', 'Entree valide', 'Retour efface']
  if (selectedGame.value === 'snake') return ['Fleches ou ZQSD', 'Boutons tactiles', 'Start manuel']
  if (selectedGame.value === 'tiles') return ['Fleches ou ZQSD', 'Boutons tactiles', 'Continuer apres 2048']
  if (selectedGame.value === 'mines') return ['Clic gauche: ouvrir', 'Clic droit: drapeau', 'Premier clic protege']
  if (selectedGame.value === 'connect') return ['Clique une colonne', 'L IA repond', 'Centre utile']
  if (selectedGame.value === 'aim') return ['Clique les cibles', 'Evite les rates', '15 cibles']
  if (selectedGame.value === 'reflex') return ['Clique pour lancer', 'Attends le vert', 'Faux depart puni']
  if (selectedGame.value === 'tic') return ['Tu joues X', 'L IA joue O', 'Aligne trois']
  if (selectedGame.value === 'higher') return ['Entre 1-100', '8 essais', 'Observe la plage']
  return ['Deux cartes', 'Memorise vite', 'Moins de coups']
})

function handleKeydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return

  const target = event.target as HTMLElement | null
  const tagName = target?.tagName?.toLowerCase()
  if (tagName && ['input', 'textarea', 'select'].includes(tagName)) return

  if (selectedGame.value === 'wordle') {
    if (event.key === 'Enter') {
      event.preventDefault()
      pressKey('ENTER')
      return
    }

    if (event.key === 'Backspace') {
      event.preventDefault()
      pressKey('BACK')
      return
    }

    if (event.key.length === 1) {
      const normalized = normalize(event.key)

      if (/^[A-Z]$/.test(normalized)) {
        event.preventDefault()
        pressKey(normalized)
      }
    }
  }

  if (selectedGame.value === 'snake') {
    const map: Record<string, Direction | undefined> = {
      ArrowUp: 'up',
      z: 'up',
      Z: 'up',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      ArrowDown: 'down',
      s: 'down',
      S: 'down',
      ArrowLeft: 'left',
      q: 'left',
      Q: 'left'
    }

    const direction = map[event.key]
    if (direction) {
      event.preventDefault()
      setSnakeDirection(direction)
    }
  }

  if (selectedGame.value === 'tiles') {
    const map: Record<string, TileDirection | undefined> = {
      ArrowUp: 'up',
      z: 'up',
      Z: 'up',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      ArrowDown: 'down',
      s: 'down',
      S: 'down',
      ArrowLeft: 'left',
      q: 'left',
      Q: 'left'
    }
    const direction = map[event.key]
    if (direction) {
      event.preventDefault()
      moveTiles(direction)
    }
  }
}

function gameStateText() {
  return JSON.stringify({
    coordinateSystem: 'DOM games; grid games use x left-to-right and y top-to-bottom from 0.',
    selectedGame: selectedGame.value,
    wordle: {
      status: wordleStatus.value,
      wordLength: wordLength.value,
      guesses: guesses.value,
      currentGuess: currentGuess.value,
      rows: board.value.map(row => row.map(cell => ({ letter: cell.letter, status: cell.status })))
    },
    higher: {
      status: higherStatus.value,
      remaining: higherRemaining.value,
      range: [higherLow.value, higherHigh.value],
      history: higherHistory.value
    },
    tic: {
      status: ticStatus.value,
      board: ticBoard.value,
      current: ticCurrent.value,
      winningLine: ticWinningLine.value
    },
    aim: {
      status: aimStatus.value,
      hits: aimHits.value,
      misses: aimMisses.value,
      target: aimTarget.value,
      duration: aimDuration.value
    },
    reflex: {
      status: reflexStatus.value,
      result: reflexResult.value,
      best: reflexBest.value
    },
    snake: {
      status: snakeStatus.value,
      score: snakeScore.value,
      direction: snakeDirection.value,
      snake: snake.value,
      food: snakeFood.value
    },
    tiles: {
      status: tileStatus.value,
      score: tileScore.value,
      board: tileBoard.value
    },
    connect: {
      status: connectStatus.value,
      board: connectBoard.value,
      winningLine: connectWinningLine.value
    },
    mines: {
      status: minesStatus.value,
      flagsLeft: minesFlagsLeft.value,
      revealed: minesBoard.value.map((cell, index) => ({
        index,
        revealed: cell.revealed,
        flagged: cell.flagged,
        adjacent: cell.revealed ? cell.adjacent : null,
        mine: minesStatus.value !== 'playing' && cell.mine
      })).filter(cell => cell.revealed || cell.flagged || cell.mine)
    },
    memory: {
      status: memoryStatus.value,
      moves: memoryMoves.value,
      open: memoryOpen.value,
      matched: memoryCards.value.filter(card => card.matched).length
    }
  })
}

function advanceTime(ms: number) {
  const steps = Math.max(1, Math.round(ms / 150))
  for (let i = 0; i < steps; i++) {
    if (selectedGame.value === 'snake') stepSnake()
  }
}

onMounted(() => {
  clockNow.value = performance.now()
  clockTimer = window.setInterval(() => {
    clockNow.value = performance.now()
  }, 100)
  newWordleGame()
  newHigherGame()
  newTicGame()
  newAimGame()
  newReflexGame()
  newSnakeGame()
  newTileGame()
  newConnectGame()
  newMinesGame()
  newMemoryGame()
  window.addEventListener('keydown', handleKeydown)
  ;(window as Window & { render_game_to_text?: () => string, advanceTime?: (ms: number) => void }).render_game_to_text = gameStateText
  ;(window as Window & { render_game_to_text?: () => string, advanceTime?: (ms: number) => void }).advanceTime = advanceTime
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (clockTimer) window.clearInterval(clockTimer)
  if (ticTimer) window.clearTimeout(ticTimer)
  if (connectTimer) window.clearTimeout(connectTimer)
  clearReflexTimer()
  stopSnakeTimer()
  if (memoryTimer) window.clearTimeout(memoryTimer)
})

watch(wordLength, () => {
  newWordleGame()
})
</script>

<template>
  <UDashboardPanel id="games-redesign">
    <template #header>
      <UDashboardNavbar :title="selectedGameMeta.label">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/games"
            icon="i-lucide-layout-grid"
            color="neutral"
            variant="ghost"
            size="sm"
            label="Arcade"
          />
          <UBadge :color="gameStatusColor" variant="subtle">
            {{ gameStatusLabel }}
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="h-full overflow-auto bg-muted/30">
        <div class="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
          <section class="overflow-hidden rounded-lg border border-default bg-default shadow-sm">
            <div class="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div class="bg-gradient-to-br from-primary/15 via-default to-info/10 p-4 sm:p-5">
                <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div class="flex min-w-0 items-start gap-4">
                    <div class="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary text-inverted shadow-sm">
                      <UIcon :name="selectedGameMeta.icon" class="size-7" />
                    </div>
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <UBadge :color="selectedGameMeta.color" variant="subtle">
                          {{ selectedGameMeta.category }}
                        </UBadge>
                        <UBadge color="neutral" variant="outline">
                          {{ selectedGameMeta.rhythm }}
                        </UBadge>
                      </div>
                      <h1 class="mt-2 text-3xl font-black tracking-tight text-highlighted sm:text-4xl">
                        {{ selectedGameMeta.label }}
                      </h1>
                      <p class="mt-2 max-w-2xl text-sm leading-6 text-toned">
                        {{ selectedGameMeta.description }}
                      </p>
                    </div>
                  </div>

                  <div class="grid min-w-64 grid-cols-2 gap-2">
                    <div
                      v-for="stat in gameStats.slice(0, 2)"
                      :key="stat.label"
                      class="rounded-lg border border-default/70 bg-default/75 p-3"
                    >
                      <p class="text-xs font-semibold uppercase text-toned">
                        {{ stat.label }}
                      </p>
                      <p class="mt-1 text-xl font-black text-highlighted">
                        {{ stat.value }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="border-t border-default bg-elevated p-4 lg:border-l lg:border-t-0">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-xs font-semibold uppercase text-toned">
                      Progression
                    </p>
                    <p class="mt-1 text-2xl font-black text-highlighted">
                      {{ gameProgress }}%
                    </p>
                  </div>
                  <div class="flex size-12 items-center justify-center rounded-lg border border-default bg-default text-primary">
                    <UIcon name="i-lucide-activity" class="size-6" />
                  </div>
                </div>
                <div class="mt-4 h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary transition-all"
                    :style="{ width: `${gameProgress}%` }"
                  />
                </div>
                <p class="mt-4 text-sm leading-6 text-toned">
                  {{ gameMessage }}
                </p>
              </div>
            </div>
          </section>

          <nav class="flex gap-2 overflow-x-auto rounded-lg border border-default bg-default p-2 shadow-sm">
            <UButton
              v-for="game in games"
              :key="game.value"
              :to="`/games/${game.value}`"
              :icon="game.icon"
              :label="game.label"
              :color="selectedGame === game.value ? game.color : 'neutral'"
              :variant="selectedGame === game.value ? 'solid' : 'ghost'"
              size="sm"
              class="shrink-0"
            />
          </nav>

          <div class="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
            <main class="overflow-hidden rounded-lg border border-default bg-default shadow-sm">
              <div class="border-b border-default px-4 py-3">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="flex size-10 items-center justify-center rounded-lg bg-elevated text-primary">
                      <UIcon :name="selectedGameMeta.icon" class="size-5" />
                    </div>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-bold text-highlighted">
                        Zone de jeu
                      </p>
                      <p class="truncate text-xs text-toned">
                        {{ gameMessage }}
                      </p>
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <UButton
                      v-if="selectedGame === 'wordle'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Nouveau"
                      @click="newWordleGame"
                    />
                    <UButton
                      v-else-if="selectedGame === 'higher'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Relancer"
                      @click="newHigherGame"
                    />
                    <UButton
                      v-else-if="selectedGame === 'tic'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Manche"
                      @click="newTicGame"
                    />
                    <template v-else-if="selectedGame === 'aim'">
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
                    </template>
                    <template v-else-if="selectedGame === 'reflex'">
                      <UButton
                        icon="i-lucide-play"
                        color="primary"
                        size="sm"
                        label="Manche"
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
                    </template>
                    <template v-else-if="selectedGame === 'snake'">
                      <UButton
                        icon="i-lucide-play"
                        color="primary"
                        size="sm"
                        label="Start"
                        @click="startSnakeGame"
                      />
                      <UButton
                        icon="i-lucide-rotate-ccw"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        label="Reset"
                        @click="newSnakeGame"
                      />
                    </template>
                    <UButton
                      v-else-if="selectedGame === 'tiles'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Nouvelle grille"
                      @click="newTileGame"
                    />
                    <UButton
                      v-else-if="selectedGame === 'connect'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Manche"
                      @click="newConnectGame"
                    />
                    <UButton
                      v-else-if="selectedGame === 'mines'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Nouvelle grille"
                      @click="newMinesGame"
                    />
                    <UButton
                      v-else
                      icon="i-lucide-shuffle"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Melanger"
                      @click="newMemoryGame"
                    />
                  </div>
                </div>
              </div>

              <div class="p-4 sm:p-5">
                <section v-if="selectedGame === 'wordle'" class="mx-auto flex min-h-[34rem] max-w-4xl flex-col items-center justify-center gap-5">
                  <div class="flex flex-wrap items-center justify-center gap-2">
                    <USelect
                      v-model="wordLength"
                      :items="LENGTH_OPTIONS"
                      size="sm"
                      class="min-w-32"
                    />
                    <UBadge :color="gameStatusColor" variant="subtle">
                      {{ wordleStatus === 'playing' ? `${MAX_GUESSES - guesses.length} essais restants` : gameStatusLabel }}
                    </UBadge>
                  </div>

                  <div class="rounded-lg border border-default bg-elevated/50 p-3 shadow-inner" :class="flashInvalid ? 'animate-pulse' : ''">
                    <div class="flex flex-col gap-1.5">
                      <div v-for="(row, rowIndex) in board" :key="rowIndex" class="flex justify-center gap-1.5">
                        <div
                          v-for="(cell, cellIndex) in row"
                          :key="cellIndex"
                          :class="['flex size-11 items-center justify-center rounded-lg border-2 text-xl font-black uppercase transition sm:size-14 sm:text-2xl', cellClass(cell.status)]"
                        >
                          {{ cell.letter }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="w-full max-w-2xl rounded-lg border border-default bg-default p-3">
                    <div v-for="(row, rowIndex) in KEYBOARD_ROWS" :key="rowIndex" class="mb-1.5 flex justify-center gap-1 last:mb-0">
                      <button
                        v-for="key in row"
                        :key="key"
                        type="button"
                        :class="['flex h-10 items-center justify-center rounded-md text-sm font-bold uppercase transition active:scale-95 sm:h-11', key === 'ENTER' || key === 'BACK' ? 'px-3 text-xs' : 'w-8 sm:w-10', keyClass(keyStatuses[key])]"
                        @click="pressKey(key)"
                      >
                        <UIcon v-if="key === 'BACK'" name="i-lucide-delete" class="size-4" />
                        <span v-else-if="key === 'ENTER'">OK</span>
                        <span v-else>{{ key }}</span>
                      </button>
                    </div>
                  </div>
                </section>

                <section v-else-if="selectedGame === 'higher'" class="grid min-h-[34rem] place-items-center">
                  <div class="w-full max-w-3xl space-y-5">
                    <div class="rounded-lg border border-default bg-elevated/50 p-5">
                      <div class="mb-4 flex flex-wrap items-center gap-2">
                        <UBadge :color="higherTone" variant="subtle">
                          {{ higherStatus === 'playing' ? `${higherRemaining} essais restants` : gameStatusLabel }}
                        </UBadge>
                        <UBadge color="neutral" variant="outline">
                          Plage {{ higherLow }} - {{ higherHigh }}
                        </UBadge>
                      </div>
                      <div class="relative mb-6 h-5 overflow-hidden rounded-full bg-muted">
                        <div class="absolute inset-y-0 rounded-full bg-primary transition-all" :style="{ left: `${higherLow - 1}%`, right: `${100 - higherHigh}%` }" />
                      </div>
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

                    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div
                        v-for="entry in higherHistory"
                        :key="entry.value"
                        class="rounded-lg border border-default bg-default p-3"
                      >
                        <p class="text-2xl font-black text-highlighted">
                          {{ entry.value }}
                        </p>
                        <p class="text-sm font-semibold text-toned">
                          {{ entry.hint === 'plus' ? 'Plus haut' : entry.hint === 'moins' ? 'Plus bas' : 'Trouve' }}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section v-else-if="selectedGame === 'tic'" class="flex min-h-[34rem] flex-col items-center justify-center gap-5">
                  <div class="grid w-full max-w-md grid-cols-3 gap-2 rounded-lg border border-default bg-elevated/60 p-3">
                    <button
                      v-for="(cell, index) in ticBoard"
                      :key="index"
                      type="button"
                      class="flex aspect-square items-center justify-center rounded-lg border text-5xl font-black transition hover:-translate-y-0.5 hover:bg-elevated sm:text-6xl"
                      :class="ticWinningLine.includes(index) ? 'border-primary bg-primary/15 shadow-sm' : 'border-default bg-default'"
                      @click="playTic(index)"
                    >
                      <span :class="cell === 'X' ? 'text-primary' : cell === 'O' ? 'text-warning' : 'text-muted/30'">{{ cell || '' }}</span>
                    </button>
                  </div>
                </section>

                <section v-else-if="selectedGame === 'aim'" class="space-y-4">
                  <div class="relative h-[34rem] overflow-hidden rounded-lg border border-default bg-elevated" @click="missAimTarget">
                    <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:32px_32px]" />
                    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_38%)]" />
                    <button
                      type="button"
                      class="absolute flex items-center justify-center rounded-full border-4 border-default bg-error text-inverted shadow-lg transition hover:scale-110 active:scale-95"
                      :style="{ left: `${aimTarget.x}%`, top: `${aimTarget.y}%`, width: `${aimTarget.size}px`, height: `${aimTarget.size}px`, transform: 'translate(-50%, -50%)' }"
                      @click.stop="hitAimTarget"
                    >
                      <span class="flex size-5 rounded-full border-2 border-inverted/80 bg-inverted/20" />
                    </button>
                    <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-default/80 px-4 py-3 text-xs font-semibold uppercase text-toned backdrop-blur">
                      <span>{{ aimHits }}/{{ AIM_TOTAL_TARGETS }} cibles</span>
                      <span>{{ aimDuration !== null ? `${aimDuration} ms` : 'Pret' }}</span>
                    </div>
                  </div>
                </section>

                <section v-else-if="selectedGame === 'reflex'" class="grid min-h-[34rem] place-items-center">
                  <button
                    type="button"
                    class="group flex min-h-[28rem] w-full max-w-3xl items-center justify-center rounded-lg border text-center transition active:scale-[0.99]"
                    :class="[
                      reflexStatus === 'ready' ? 'border-success bg-success/20 shadow-sm' : '',
                      reflexStatus === 'waiting' ? 'border-warning bg-warning/15' : '',
                      reflexStatus === 'too-soon' ? 'border-error bg-error/15' : '',
                      reflexStatus === 'done' ? 'border-info bg-info/15' : '',
                      reflexStatus === 'idle' ? 'border-default bg-elevated/60 hover:bg-elevated' : ''
                    ]"
                    @click="handleReflexClick"
                  >
                    <div class="space-y-4 px-6">
                      <p class="text-sm font-bold uppercase text-toned">
                        Zone de clic
                      </p>
                      <p class="text-5xl font-black text-highlighted sm:text-7xl">
                        {{ reflexStatus === 'ready' ? 'CLIQUE' : reflexStatus === 'waiting' ? '...' : reflexStatus === 'too-soon' ? 'TROP TOT' : reflexResult !== null ? `${reflexResult} ms` : 'START' }}
                      </p>
                      <p class="text-sm text-toned">
                        {{ reflexMessage }}
                      </p>
                    </div>
                  </button>
                </section>

                <section v-else-if="selectedGame === 'snake'" class="flex min-h-[34rem] flex-col items-center justify-center gap-4">
                  <div class="grid w-full max-w-[34rem] grid-cols-12 gap-1 rounded-lg border border-default bg-inverted p-3 shadow-inner">
                    <div
                      v-for="cell in snakeCells"
                      :key="`${cell.x}-${cell.y}`"
                      class="aspect-square rounded-sm transition"
                      :class="cell.head ? 'bg-success shadow-sm' : cell.body ? 'bg-success/70' : cell.food ? 'bg-error shadow-sm' : 'bg-default/15'"
                    />
                  </div>
                  <div class="grid grid-cols-3 gap-2">
                    <span />
                    <UButton
                      icon="i-lucide-chevron-up"
                      color="neutral"
                      variant="outline"
                      aria-label="Haut"
                      @click="setSnakeDirection('up')"
                    />
                    <span />
                    <UButton
                      icon="i-lucide-chevron-left"
                      color="neutral"
                      variant="outline"
                      aria-label="Gauche"
                      @click="setSnakeDirection('left')"
                    />
                    <UButton
                      icon="i-lucide-play"
                      color="primary"
                      aria-label="Start"
                      @click="startSnakeGame"
                    />
                    <UButton
                      icon="i-lucide-chevron-right"
                      color="neutral"
                      variant="outline"
                      aria-label="Droite"
                      @click="setSnakeDirection('right')"
                    />
                    <span />
                    <UButton
                      icon="i-lucide-chevron-down"
                      color="neutral"
                      variant="outline"
                      aria-label="Bas"
                      @click="setSnakeDirection('down')"
                    />
                    <span />
                  </div>
                </section>

                <section v-else-if="selectedGame === 'tiles'" class="flex min-h-[34rem] flex-col items-center justify-center gap-4">
                  <UButton
                    v-if="tileStatus === 'won'"
                    label="Continuer"
                    icon="i-lucide-play"
                    size="sm"
                    @click="continueTileGame"
                  />
                  <div class="grid w-full max-w-[31rem] grid-cols-4 gap-3 rounded-lg border border-default bg-elevated/70 p-3">
                    <div
                      v-for="(value, index) in tileBoard"
                      :key="index"
                      class="flex aspect-square items-center justify-center rounded-lg text-3xl font-black shadow-sm transition sm:text-4xl"
                      :class="tileClass(value)"
                    >
                      {{ value || '' }}
                    </div>
                  </div>
                  <div class="grid grid-cols-3 gap-2">
                    <span />
                    <UButton
                      icon="i-lucide-chevron-up"
                      color="neutral"
                      variant="outline"
                      aria-label="Haut"
                      @click="moveTiles('up')"
                    />
                    <span />
                    <UButton
                      icon="i-lucide-chevron-left"
                      color="neutral"
                      variant="outline"
                      aria-label="Gauche"
                      @click="moveTiles('left')"
                    />
                    <UButton
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      aria-label="Reset"
                      @click="newTileGame"
                    />
                    <UButton
                      icon="i-lucide-chevron-right"
                      color="neutral"
                      variant="outline"
                      aria-label="Droite"
                      @click="moveTiles('right')"
                    />
                    <span />
                    <UButton
                      icon="i-lucide-chevron-down"
                      color="neutral"
                      variant="outline"
                      aria-label="Bas"
                      @click="moveTiles('down')"
                    />
                    <span />
                  </div>
                </section>

                <section v-else-if="selectedGame === 'connect'" class="flex min-h-[34rem] flex-col items-center justify-center gap-4">
                  <div class="grid w-full max-w-2xl grid-cols-7 gap-2 rounded-lg border border-default bg-info p-3 shadow-sm">
                    <button
                      v-for="col in CONNECT_COLS"
                      :key="`drop-${col}`"
                      type="button"
                      class="mb-1 rounded-md bg-inverted/15 py-2 text-inverted transition hover:bg-inverted/25"
                      @click="playConnect(col - 1)"
                    >
                      <UIcon name="i-lucide-chevron-down" class="mx-auto size-4" />
                    </button>
                    <div
                      v-for="(disc, index) in connectBoard"
                      :key="index"
                      class="aspect-square rounded-full border-4 border-inverted/25 transition"
                      :class="[
                        disc === 'player' ? 'bg-error shadow-inner' : disc === 'ai' ? 'bg-warning shadow-inner' : 'bg-inverted/20',
                        connectWinningLine.includes(index) ? 'ring-4 ring-inverted' : ''
                      ]"
                    />
                  </div>
                </section>

                <section v-else-if="selectedGame === 'mines'" class="flex min-h-[34rem] flex-col items-center justify-center gap-4">
                  <div class="grid w-full max-w-[34rem] grid-cols-8 gap-1 rounded-lg border border-default bg-elevated/70 p-3">
                    <button
                      v-for="(cell, index) in minesBoard"
                      :key="index"
                      type="button"
                      class="flex aspect-square items-center justify-center rounded-md border text-sm font-black transition sm:text-lg"
                      :class="cell.revealed ? cell.mine ? 'border-error bg-error text-inverted' : 'border-default bg-default text-highlighted' : cell.flagged ? 'border-warning bg-warning/20 text-warning' : 'border-default bg-accented hover:-translate-y-0.5 hover:bg-elevated'"
                      @click="revealMine(index)"
                      @contextmenu.prevent="toggleMineFlag(index)"
                    >
                      <UIcon v-if="cell.revealed && cell.mine" name="i-lucide-bomb" class="size-5" />
                      <span v-else-if="cell.revealed && cell.adjacent">{{ cell.adjacent }}</span>
                      <UIcon v-else-if="cell.flagged" name="i-lucide-flag" class="size-5" />
                    </button>
                  </div>
                </section>

                <section v-else class="flex min-h-[34rem] flex-col items-center justify-center gap-4">
                  <div class="grid w-full max-w-[34rem] grid-cols-4 gap-3">
                    <button
                      v-for="(card, index) in memoryCards"
                      :key="card.id"
                      type="button"
                      class="flex aspect-[1/1.12] flex-col items-center justify-center gap-2 rounded-lg border text-center font-black transition"
                      :class="card.revealed || card.matched ? 'border-primary/50 bg-primary/10 text-primary shadow-sm' : 'border-default bg-elevated text-muted hover:-translate-y-1 hover:bg-accented hover:shadow-md'"
                      @click="flipMemoryCard(index)"
                    >
                      <template v-if="card.revealed || card.matched">
                        <UIcon :name="card.icon" class="size-7" />
                        <span class="text-sm">{{ card.label }}</span>
                      </template>
                      <UIcon v-else name="i-lucide-sparkles" class="size-6" />
                    </button>
                  </div>
                </section>
              </div>
            </main>

            <aside class="space-y-4">
              <section class="rounded-lg border border-default bg-default p-4 shadow-sm">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold text-highlighted">
                      Tableau de bord
                    </p>
                    <p class="text-xs text-toned">
                      Stats de la session
                    </p>
                  </div>
                  <UBadge :color="gameStatusColor" variant="subtle">
                    {{ gameStatusLabel }}
                  </UBadge>
                </div>
                <div class="mt-4 grid grid-cols-2 gap-2">
                  <div
                    v-for="stat in gameStats"
                    :key="stat.label"
                    class="rounded-lg border border-default/70 bg-elevated/45 p-3"
                  >
                    <p class="text-xs font-semibold text-toned">
                      {{ stat.label }}
                    </p>
                    <p class="mt-1 text-lg font-black text-highlighted">
                      {{ stat.value }}
                    </p>
                  </div>
                </div>
              </section>

              <section class="rounded-lg border border-default bg-default p-4 shadow-sm">
                <p class="text-sm font-bold text-highlighted">
                  Commandes
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <UBadge
                    v-for="hint in controlHints"
                    :key="hint"
                    color="neutral"
                    variant="outline"
                  >
                    {{ hint }}
                  </UBadge>
                </div>
              </section>

              <section class="rounded-lg border border-default bg-default p-4 shadow-sm">
                <p class="text-sm font-bold text-highlighted">
                  Tous les jeux
                </p>
                <div class="mt-3 grid gap-2">
                  <UButton
                    v-for="game in games"
                    :key="game.value"
                    :to="`/games/${game.value}`"
                    :icon="game.icon"
                    :label="game.label"
                    :color="selectedGame === game.value ? game.color : 'neutral'"
                    :variant="selectedGame === game.value ? 'soft' : 'ghost'"
                    block
                    class="justify-start"
                  />
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
