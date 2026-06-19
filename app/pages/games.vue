<script setup lang="ts">
type GameTab = 'wordle' | 'higher' | 'tic' | 'aim' | 'reflex' | 'snake' | 'tiles' | 'connect' | 'mines' | 'memory'
type CellStatus = 'empty' | 'pending' | 'correct' | 'present' | 'absent'
type Cell = { letter: string, status: CellStatus }
type GameStatus = 'playing' | 'won' | 'lost'
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
type MemoryCard = { id: number, value: string, revealed: boolean, matched: boolean }

const selectedGame = ref<GameTab>('wordle')

const games = [
  { value: 'wordle', label: 'Mot mystere', short: 'Word', icon: 'i-lucide-spell-check', accent: 'from-emerald-500 to-lime-400' },
  { value: 'higher', label: 'Plus ou moins', short: '100', icon: 'i-lucide-binary', accent: 'from-sky-500 to-cyan-400' },
  { value: 'tic', label: 'Morpion', short: 'X/O', icon: 'i-lucide-grid-3x3', accent: 'from-amber-500 to-orange-400' },
  { value: 'aim', label: 'Precision', short: 'Aim', icon: 'i-lucide-crosshair', accent: 'from-rose-500 to-pink-400' },
  { value: 'reflex', label: 'Reflexe', short: 'ms', icon: 'i-lucide-timer-reset', accent: 'from-violet-500 to-fuchsia-400' },
  { value: 'snake', label: 'Snake', short: 'S', icon: 'i-lucide-worm', accent: 'from-green-500 to-emerald-300' },
  { value: 'tiles', label: '2048', short: '2k', icon: 'i-lucide-layout-grid', accent: 'from-orange-500 to-yellow-300' },
  { value: 'connect', label: 'Puissance 4', short: '4', icon: 'i-lucide-circle-dot', accent: 'from-red-500 to-yellow-400' },
  { value: 'mines', label: 'Demineur', short: 'M', icon: 'i-lucide-bomb', accent: 'from-zinc-500 to-slate-300' },
  { value: 'memory', label: 'Memoire', short: 'Mem', icon: 'i-lucide-brain', accent: 'from-indigo-500 to-sky-400' }
] satisfies {
  value: GameTab
  label: string
  short: string
  icon: string
  accent: string
}[]

const selectedGameMeta = computed(() => games.find(game => game.value === selectedGame.value) || games[0]!)

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
  if (status === 'correct') return 'bg-emerald-500 text-white border-emerald-400 shadow-[0_0_22px_rgba(16,185,129,0.24)]'
  if (status === 'present') return 'bg-amber-400 text-white border-amber-300 shadow-[0_0_22px_rgba(251,191,36,0.2)]'
  if (status === 'absent') return 'bg-neutral-500 text-white border-neutral-500'
  if (status === 'pending') return 'bg-default border-primary/40 text-highlighted shadow-sm'
  return 'bg-elevated/50 border-default/70 text-muted'
}

function keyClass(status: CellStatus | undefined) {
  if (status === 'correct') return 'bg-emerald-500 text-white hover:bg-emerald-600'
  if (status === 'present') return 'bg-amber-400 text-white hover:bg-amber-500'
  if (status === 'absent') return 'bg-neutral-500 text-white hover:bg-neutral-600'
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
    aimMessage.value = `Termine en ${duration} ms.`
    return
  }

  placeAimTarget()
}

const aimDuration = computed(() => {
  if (aimStartedAt.value === null) return null
  const end = aimFinishedAt.value ?? performance.now()
  return Math.round(end - aimStartedAt.value)
})

const aimAccuracy = computed(() => {
  const total = aimHits.value + aimMisses.value
  if (!total) return 100
  return Math.round((aimHits.value / total) * 100)
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
  if (value <= 4) return 'bg-amber-100 text-amber-950'
  if (value <= 16) return 'bg-orange-200 text-orange-950'
  if (value <= 64) return 'bg-orange-400 text-white'
  if (value <= 256) return 'bg-yellow-400 text-yellow-950'
  if (value <= 1024) return 'bg-emerald-400 text-emerald-950'
  return 'bg-sky-500 text-white'
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
    connectStatus.value = 'lost'
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
  const next = [...minesBoard.value]
  next[index] = { ...cell, flagged: !cell.flagged }
  minesBoard.value = next
}

const minesFlagsLeft = computed(() => MINE_COUNT - minesBoard.value.filter(cell => cell.flagged).length)
const minesElapsed = computed(() => {
  if (minesStartedAt.value === null) return 0
  return Math.round(((minesFinishedAt.value ?? performance.now()) - minesStartedAt.value) / 1000)
})

const MEMORY_VALUES = ['RAM', 'USB', 'CPU', 'SSD', 'SIM', 'LCD', 'WiFi', 'GPU']
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
  memoryCards.value = shuffle([...MEMORY_VALUES, ...MEMORY_VALUES]).map((value, index) => ({
    id: index,
    value,
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
  <UDashboardPanel id="games">
    <template #header>
      <UDashboardNavbar title="Jeux">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UBadge color="primary" variant="subtle">
            10 mini-jeux
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(0,193,106,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_26%)]">
        <div class="border-b border-default/70 px-4 py-3 md:px-6">
          <div class="flex items-center gap-3 overflow-x-auto pb-1">
            <button
              v-for="game in games"
              :key="game.value"
              type="button"
              class="group grid min-w-[9.4rem] grid-cols-[auto_1fr] items-center gap-3 rounded-lg border px-3 py-2 text-left transition"
              :class="selectedGame === game.value ? 'border-primary/60 bg-primary/10 shadow-sm' : 'border-default/70 bg-default/75 hover:bg-elevated'"
              @click="selectedGame = game.value"
            >
              <span
                class="flex size-10 items-center justify-center rounded-md bg-gradient-to-br text-sm font-black text-white shadow-sm"
                :class="game.accent"
              >
                {{ game.short }}
              </span>
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold text-highlighted">{{ game.label }}</span>
                <span class="mt-0.5 flex items-center gap-1 text-xs text-toned">
                  <UIcon :name="game.icon" class="size-3.5" />
                  Jouer
                </span>
              </span>
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <div class="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div class="min-h-[34rem] overflow-hidden rounded-lg border border-default bg-default/90 shadow-sm">
              <div class="border-b border-default/70 px-4 py-3 sm:px-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="flex size-9 items-center justify-center rounded-md bg-gradient-to-br text-white" :class="selectedGameMeta.accent">
                        <UIcon :name="selectedGameMeta.icon" class="size-5" />
                      </span>
                      <div>
                        <p class="text-base font-semibold text-highlighted">
                          {{ selectedGameMeta.label }}
                        </p>
                        <p class="text-sm text-toned">
                          <template v-if="selectedGame === 'wordle'">
                            Un mot cache, six essais, feedback instantane.
                          </template>
                          <template v-else-if="selectedGame === 'higher'">
                            Trouve la cible en resserrant la plage.
                          </template>
                          <template v-else-if="selectedGame === 'tic'">
                            Bats l IA sur une grille 3 par 3.
                          </template>
                          <template v-else-if="selectedGame === 'aim'">
                            Vise vite, rate peu, termine le run.
                          </template>
                          <template v-else-if="selectedGame === 'reflex'">
                            Attends le signal et clique sans anticiper.
                          </template>
                          <template v-else-if="selectedGame === 'snake'">
                            Mange, grandis, evite les murs et ton corps.
                          </template>
                          <template v-else-if="selectedGame === 'tiles'">
                            Fusionne les tuiles jusqu au 2048.
                          </template>
                          <template v-else-if="selectedGame === 'connect'">
                            Aligne quatre disques avant l IA.
                          </template>
                          <template v-else-if="selectedGame === 'mines'">
                            Nettoie la grille sans declencher les mines.
                          </template>
                          <template v-else>
                            Memorise les positions et retrouve les paires.
                          </template>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      v-if="selectedGame === 'wordle'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Nouvelle partie"
                      @click="newWordleGame"
                    />
                    <UButton
                      v-if="selectedGame === 'higher'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Relancer"
                      @click="newHigherGame"
                    />
                    <UButton
                      v-if="selectedGame === 'tic'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Nouvelle manche"
                      @click="newTicGame"
                    />
                    <UButton
                      v-if="selectedGame === 'aim'"
                      icon="i-lucide-play"
                      color="primary"
                      size="sm"
                      label="Lancer"
                      @click="startAimGame"
                    />
                    <UButton
                      v-if="selectedGame === 'aim'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Reset"
                      @click="newAimGame"
                    />
                    <UButton
                      v-if="selectedGame === 'reflex'"
                      icon="i-lucide-play"
                      color="primary"
                      size="sm"
                      label="Manche"
                      @click="startReflexRound"
                    />
                    <UButton
                      v-if="selectedGame === 'reflex'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Reset"
                      @click="newReflexGame"
                    />
                    <UButton
                      v-if="selectedGame === 'snake'"
                      icon="i-lucide-play"
                      color="primary"
                      size="sm"
                      label="Start"
                      @click="startSnakeGame"
                    />
                    <UButton
                      v-if="selectedGame === 'snake'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Reset"
                      @click="newSnakeGame"
                    />
                    <UButton
                      v-if="selectedGame === 'tiles'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Nouvelle grille"
                      @click="newTileGame"
                    />
                    <UButton
                      v-if="selectedGame === 'connect'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Nouvelle manche"
                      @click="newConnectGame"
                    />
                    <UButton
                      v-if="selectedGame === 'mines'"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="Nouvelle grille"
                      @click="newMinesGame"
                    />
                    <UButton
                      v-if="selectedGame === 'memory'"
                      icon="i-lucide-rotate-ccw"
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
                <section v-if="selectedGame === 'wordle'" class="flex min-h-[28rem] flex-col items-center justify-center gap-5">
                  <div class="flex flex-wrap items-center justify-center gap-2">
                    <USelect
                      v-model="wordLength"
                      :items="LENGTH_OPTIONS"
                      size="sm"
                      class="min-w-32"
                    />
                    <UBadge :color="wordleStatus === 'won' ? 'success' : wordleStatus === 'lost' ? 'error' : 'neutral'" variant="subtle">
                      {{ wordleStatus === 'playing' ? `${MAX_GUESSES - guesses.length} essais` : wordleStatus === 'won' ? 'Trouve' : 'Perdu' }}
                    </UBadge>
                  </div>

                  <UAlert
                    v-if="wordleMessage"
                    :color="wordleStatus === 'won' ? 'success' : wordleStatus === 'lost' ? 'error' : 'neutral'"
                    variant="subtle"
                    :title="wordleMessage"
                    class="w-full max-w-md"
                  />

                  <div class="flex flex-col gap-1.5 rounded-lg bg-elevated/40 p-3 ring-1 ring-default/70" :class="flashInvalid ? 'animate-pulse' : ''">
                    <div v-for="(row, rowIndex) in board" :key="rowIndex" class="flex gap-1.5">
                      <div
                        v-for="(cell, cellIndex) in row"
                        :key="cellIndex"
                        :class="['flex size-11 items-center justify-center rounded-md border-2 text-xl font-black uppercase transition sm:size-14 sm:text-2xl', cellClass(cell.status)]"
                      >
                        {{ cell.letter }}
                      </div>
                    </div>
                  </div>

                  <div class="flex w-full max-w-xl flex-col gap-1.5">
                    <div v-for="(row, rowIndex) in KEYBOARD_ROWS" :key="rowIndex" class="flex justify-center gap-1">
                      <button
                        v-for="key in row"
                        :key="key"
                        type="button"
                        :class="['flex h-10 items-center justify-center rounded-md text-sm font-bold uppercase transition active:scale-95 sm:h-11', key === 'ENTER' || key === 'BACK' ? 'px-3 text-xs' : 'w-8 sm:w-10', keyClass(keyStatuses[key])]"
                        @click="pressKey(key)"
                      >
                        <template v-if="key === 'BACK'">
                          ⌫
                        </template>
                        <template v-else-if="key === 'ENTER'">
                          OK
                        </template>
                        <template v-else>
                          {{ key }}
                        </template>
                      </button>
                    </div>
                  </div>
                </section>

                <section v-else-if="selectedGame === 'higher'" class="grid min-h-[28rem] place-items-center">
                  <div class="w-full max-w-2xl space-y-5">
                    <div class="rounded-lg border border-default bg-elevated/40 p-5">
                      <div class="mb-4 flex flex-wrap items-center gap-2">
                        <UBadge :color="higherTone" variant="subtle">
                          {{ higherStatus === 'playing' ? `${higherRemaining} essais restants` : higherStatus === 'won' ? 'Trouve' : 'Perdu' }}
                        </UBadge>
                        <UBadge color="neutral" variant="outline">
                          Plage {{ higherLow }} - {{ higherHigh }}
                        </UBadge>
                      </div>
                      <div class="relative mb-5 h-4 overflow-hidden rounded-full bg-muted">
                        <div class="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-500 to-emerald-400" :style="{ left: `${higherLow - 1}%`, right: `${100 - higherHigh}%` }" />
                      </div>
                      <UAlert :color="higherTone" variant="subtle" :title="higherMessage" />
                      <div class="mt-5 flex flex-col gap-3 sm:flex-row">
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

                    <div class="flex flex-wrap gap-2">
                      <UBadge
                        v-for="entry in higherHistory"
                        :key="entry.value"
                        :color="entry.hint === 'trouve' ? 'success' : 'neutral'"
                        variant="subtle"
                        size="lg"
                      >
                        {{ entry.value }} · {{ entry.hint === 'plus' ? 'plus haut' : entry.hint === 'moins' ? 'plus bas' : 'trouve' }}
                      </UBadge>
                    </div>
                  </div>
                </section>

                <section v-else-if="selectedGame === 'tic'" class="flex min-h-[28rem] flex-col items-center justify-center gap-5">
                  <UAlert
                    :color="ticStatus === 'won' ? 'success' : ticStatus === 'lost' ? 'error' : 'neutral'"
                    variant="subtle"
                    :title="ticMessage"
                    class="w-full max-w-md"
                  />
                  <div class="grid w-full max-w-sm grid-cols-3 gap-2 rounded-lg bg-elevated/50 p-3 ring-1 ring-default/70">
                    <button
                      v-for="(cell, index) in ticBoard"
                      :key="index"
                      type="button"
                      class="flex aspect-square items-center justify-center rounded-lg border text-5xl font-black transition hover:-translate-y-0.5 hover:bg-elevated"
                      :class="ticWinningLine.includes(index) ? 'border-primary bg-primary/15 shadow-[0_0_30px_rgba(0,193,106,0.28)]' : 'border-default bg-default'"
                      @click="playTic(index)"
                    >
                      <span :class="cell === 'X' ? 'text-primary' : cell === 'O' ? 'text-warning' : 'text-muted/30'">{{ cell || '·' }}</span>
                    </button>
                  </div>
                </section>

                <section v-else-if="selectedGame === 'aim'" class="space-y-4">
                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge :color="aimStatus === 'done' ? 'success' : aimStatus === 'playing' ? 'warning' : 'neutral'" variant="subtle">
                      {{ aimStatus === 'idle' ? 'Pret' : aimStatus === 'playing' ? `${aimHits}/${AIM_TOTAL_TARGETS}` : 'Termine' }}
                    </UBadge>
                    <UBadge color="neutral" variant="outline">
                      {{ aimDuration !== null ? `${aimDuration} ms` : '0 ms' }}
                    </UBadge>
                    <UBadge color="neutral" variant="outline">
                      {{ aimAccuracy }}% precision
                    </UBadge>
                  </div>
                  <div class="relative h-[30rem] overflow-hidden rounded-lg border border-default bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.16),transparent_28%),linear-gradient(135deg,rgba(14,165,233,0.08),rgba(0,193,106,0.08))]" @click="missAimTarget">
                    <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:30px_30px]" />
                    <button
                      type="button"
                      class="absolute flex items-center justify-center rounded-full border-4 border-white/95 bg-rose-500 shadow-[0_16px_45px_rgba(244,63,94,0.38)] transition hover:scale-110 active:scale-95"
                      :style="{ left: `${aimTarget.x}%`, top: `${aimTarget.y}%`, width: `${aimTarget.size}px`, height: `${aimTarget.size}px`, transform: 'translate(-50%, -50%)' }"
                      @click.stop="hitAimTarget"
                    >
                      <span class="flex size-5 rounded-full border-2 border-white bg-white/25" />
                    </button>
                    <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-default/70 px-4 py-3 text-xs font-semibold uppercase text-toned backdrop-blur">
                      <span>{{ aimMessage }}</span>
                      <span>{{ AIM_TOTAL_TARGETS - aimHits }} restantes</span>
                    </div>
                  </div>
                </section>

                <section v-else-if="selectedGame === 'reflex'" class="grid min-h-[28rem] place-items-center">
                  <button
                    type="button"
                    class="group flex min-h-96 w-full max-w-3xl items-center justify-center rounded-lg border text-center transition"
                    :class="[
                      reflexStatus === 'ready' ? 'border-emerald-500/70 bg-emerald-500/20 shadow-[0_0_70px_rgba(16,185,129,0.22)]' : '',
                      reflexStatus === 'waiting' ? 'border-amber-500/50 bg-amber-500/15' : '',
                      reflexStatus === 'too-soon' ? 'border-rose-500/60 bg-rose-500/15' : '',
                      reflexStatus === 'done' ? 'border-sky-500/60 bg-sky-500/15' : '',
                      reflexStatus === 'idle' ? 'border-default bg-elevated/40 hover:bg-elevated' : ''
                    ]"
                    @click="handleReflexClick"
                  >
                    <div class="space-y-4 px-6">
                      <p class="text-sm font-bold uppercase tracking-[0.18em] text-toned">
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

                <section v-else-if="selectedGame === 'snake'" class="flex min-h-[28rem] flex-col items-center justify-center gap-4">
                  <div class="grid w-full max-w-[34rem] grid-cols-12 gap-1 rounded-lg bg-zinc-950 p-3 shadow-inner">
                    <div
                      v-for="cell in snakeCells"
                      :key="`${cell.x}-${cell.y}`"
                      class="aspect-square rounded-sm transition"
                      :class="cell.head ? 'bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.65)]' : cell.body ? 'bg-emerald-500' : cell.food ? 'bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.65)]' : 'bg-zinc-800'"
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

                <section v-else-if="selectedGame === 'tiles'" class="flex min-h-[28rem] flex-col items-center justify-center gap-4">
                  <UAlert
                    v-if="tileStatus !== 'playing'"
                    :color="tileStatus === 'won' ? 'success' : 'error'"
                    variant="subtle"
                    :title="tileStatus === 'won' ? '2048 atteint.' : 'Plus aucun mouvement.'"
                    class="w-full max-w-md"
                    :actions="tileStatus === 'won' ? [{ label: 'Continuer', color: 'primary', variant: 'solid' } as any] : []"
                    @click="continueTileGame"
                  />
                  <div class="grid w-full max-w-[30rem] grid-cols-4 gap-3 rounded-lg bg-amber-950/20 p-3 ring-1 ring-default">
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

                <section v-else-if="selectedGame === 'connect'" class="flex min-h-[28rem] flex-col items-center justify-center gap-4">
                  <UAlert
                    :color="connectStatus === 'won' ? 'success' : connectStatus === 'lost' ? 'error' : 'neutral'"
                    variant="subtle"
                    :title="connectMessage"
                    class="w-full max-w-xl"
                  />
                  <div class="grid w-full max-w-2xl grid-cols-7 gap-2 rounded-lg bg-sky-700 p-3 shadow-lg">
                    <button
                      v-for="col in CONNECT_COLS"
                      :key="`drop-${col}`"
                      type="button"
                      class="mb-1 rounded-md bg-white/15 py-1 text-xs font-bold text-white transition hover:bg-white/25"
                      @click="playConnect(col - 1)"
                    >
                      ↓
                    </button>
                    <div
                      v-for="(disc, index) in connectBoard"
                      :key="index"
                      class="aspect-square rounded-full border-4 border-sky-900/40 transition"
                      :class="[
                        disc === 'player' ? 'bg-red-500 shadow-inner' : disc === 'ai' ? 'bg-yellow-300 shadow-inner' : 'bg-sky-950/70',
                        connectWinningLine.includes(index) ? 'ring-4 ring-white' : ''
                      ]"
                    />
                  </div>
                </section>

                <section v-else-if="selectedGame === 'mines'" class="flex min-h-[28rem] flex-col items-center justify-center gap-4">
                  <div class="flex flex-wrap items-center justify-center gap-2">
                    <UBadge :color="minesStatus === 'won' ? 'success' : minesStatus === 'lost' ? 'error' : 'neutral'" variant="subtle">
                      {{ minesMessage }}
                    </UBadge>
                    <UBadge color="neutral" variant="outline">
                      {{ minesFlagsLeft }} drapeaux
                    </UBadge>
                    <UBadge color="neutral" variant="outline">
                      {{ minesElapsed }} s
                    </UBadge>
                  </div>
                  <div class="grid w-full max-w-[34rem] grid-cols-8 gap-1 rounded-lg bg-elevated/60 p-3 ring-1 ring-default">
                    <button
                      v-for="(cell, index) in minesBoard"
                      :key="index"
                      type="button"
                      class="flex aspect-square items-center justify-center rounded-md border text-sm font-black transition sm:text-lg"
                      :class="cell.revealed ? cell.mine ? 'border-rose-500 bg-rose-500 text-white' : 'border-default bg-default text-highlighted' : cell.flagged ? 'border-amber-500 bg-amber-500/20 text-amber-500' : 'border-default bg-accented hover:-translate-y-0.5 hover:bg-elevated'"
                      @click="revealMine(index)"
                      @contextmenu.prevent="toggleMineFlag(index)"
                    >
                      <template v-if="cell.revealed && cell.mine">
                        ✹
                      </template>
                      <template v-else-if="cell.revealed && cell.adjacent">
                        {{ cell.adjacent }}
                      </template>
                      <template v-else-if="cell.flagged">
                        ⚑
                      </template>
                    </button>
                  </div>
                </section>

                <section v-else class="flex min-h-[28rem] flex-col items-center justify-center gap-4">
                  <UAlert
                    :color="memoryStatus === 'won' ? 'success' : 'neutral'"
                    variant="subtle"
                    :title="memoryMessage"
                    class="w-full max-w-xl"
                  />
                  <div class="grid w-full max-w-[34rem] grid-cols-4 gap-3">
                    <button
                      v-for="(card, index) in memoryCards"
                      :key="card.id"
                      type="button"
                      class="flex aspect-[1/1.15] items-center justify-center rounded-lg border text-xl font-black transition sm:text-2xl"
                      :class="card.revealed || card.matched ? 'border-primary/50 bg-primary/10 text-primary shadow-sm' : 'border-default bg-gradient-to-br from-zinc-800 to-zinc-950 text-white hover:-translate-y-1 hover:shadow-md'"
                      @click="flipMemoryCard(index)"
                    >
                      {{ card.revealed || card.matched ? card.value : '?' }}
                    </button>
                  </div>
                </section>
              </div>
            </div>

            <aside class="space-y-4">
              <div class="rounded-lg border border-default bg-default/90 p-4 shadow-sm">
                <p class="text-sm font-semibold text-highlighted">
                  Tableau de bord
                </p>
                <div class="mt-3 grid gap-2">
                  <div class="rounded-md border border-default/70 px-3 py-2">
                    <p class="text-xs uppercase tracking-[0.12em] text-toned">
                      Partie
                    </p>
                    <p class="text-lg font-semibold text-highlighted">
                      {{ selectedGameMeta.label }}
                    </p>
                  </div>
                  <div v-if="selectedGame === 'wordle'" class="grid grid-cols-2 gap-2">
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Winrate
                      </p><p class="font-semibold text-highlighted">
                        {{ wordleWinRate }}%
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Serie
                      </p><p class="font-semibold text-highlighted">
                        {{ wordleStats.streak }}
                      </p>
                    </div>
                  </div>
                  <div v-else-if="selectedGame === 'higher'" class="grid grid-cols-2 gap-2">
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Victoires
                      </p><p class="font-semibold text-highlighted">
                        {{ higherWins }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Plage
                      </p><p class="font-semibold text-highlighted">
                        {{ higherLow }}-{{ higherHigh }}
                      </p>
                    </div>
                  </div>
                  <div v-else-if="selectedGame === 'tic'" class="grid grid-cols-3 gap-2">
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Toi
                      </p><p class="font-semibold text-highlighted">
                        {{ ticScores.player }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        IA
                      </p><p class="font-semibold text-highlighted">
                        {{ ticScores.ai }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Nuls
                      </p><p class="font-semibold text-highlighted">
                        {{ ticScores.draw }}
                      </p>
                    </div>
                  </div>
                  <div v-else-if="selectedGame === 'aim'" class="grid grid-cols-2 gap-2">
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Best
                      </p><p class="font-semibold text-highlighted">
                        {{ aimBest !== null ? `${aimBest} ms` : '-' }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Moyenne
                      </p><p class="font-semibold text-highlighted">
                        {{ aimAveragePerTarget !== null ? `${aimAveragePerTarget} ms` : '-' }}
                      </p>
                    </div>
                  </div>
                  <div v-else-if="selectedGame === 'reflex'" class="grid grid-cols-2 gap-2">
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Best
                      </p><p class="font-semibold text-highlighted">
                        {{ reflexBest !== null ? `${reflexBest} ms` : '-' }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Moyenne
                      </p><p class="font-semibold text-highlighted">
                        {{ averageReflex !== null ? `${averageReflex} ms` : '-' }}
                      </p>
                    </div>
                  </div>
                  <div v-else-if="selectedGame === 'snake'" class="grid grid-cols-2 gap-2">
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Score
                      </p><p class="font-semibold text-highlighted">
                        {{ snakeScore }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Best
                      </p><p class="font-semibold text-highlighted">
                        {{ snakeBest }}
                      </p>
                    </div>
                  </div>
                  <div v-else-if="selectedGame === 'tiles'" class="grid grid-cols-2 gap-2">
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Score
                      </p><p class="font-semibold text-highlighted">
                        {{ tileScore }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Best
                      </p><p class="font-semibold text-highlighted">
                        {{ tileBest }}
                      </p>
                    </div>
                  </div>
                  <div v-else-if="selectedGame === 'connect'" class="grid grid-cols-3 gap-2">
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Toi
                      </p><p class="font-semibold text-highlighted">
                        {{ connectScores.player }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        IA
                      </p><p class="font-semibold text-highlighted">
                        {{ connectScores.ai }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Nuls
                      </p><p class="font-semibold text-highlighted">
                        {{ connectScores.draw }}
                      </p>
                    </div>
                  </div>
                  <div v-else-if="selectedGame === 'mines'" class="grid grid-cols-2 gap-2">
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Gagnees
                      </p><p class="font-semibold text-highlighted">
                        {{ minesWins }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Temps
                      </p><p class="font-semibold text-highlighted">
                        {{ minesElapsed }} s
                      </p>
                    </div>
                  </div>
                  <div v-else class="grid grid-cols-2 gap-2">
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Coups
                      </p><p class="font-semibold text-highlighted">
                        {{ memoryMoves }}
                      </p>
                    </div>
                    <div class="rounded-md border border-default/70 px-3 py-2">
                      <p class="text-xs text-toned">
                        Best
                      </p><p class="font-semibold text-highlighted">
                        {{ memoryBest ?? '-' }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="rounded-lg border border-default bg-default/90 p-4 shadow-sm">
                <p class="text-sm font-semibold text-highlighted">
                  Commandes
                </p>
                <div class="mt-3 space-y-2 text-sm text-toned">
                  <p v-if="selectedGame === 'wordle'">
                    Clavier physique ou boutons. Entree valide, retour efface.
                  </p>
                  <p v-else-if="selectedGame === 'snake'">
                    Fleches ou ZQSD. Le premier mouvement lance la partie.
                  </p>
                  <p v-else-if="selectedGame === 'tiles'">
                    Fleches ou ZQSD pour fusionner les tuiles.
                  </p>
                  <p v-else-if="selectedGame === 'mines'">
                    Clic gauche pour reveler, clic droit pour poser un drapeau.
                  </p>
                  <p v-else-if="selectedGame === 'connect'">
                    Clique une colonne pour deposer ton disque.
                  </p>
                  <p v-else>
                    Tout se joue a la souris ou au tactile.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
