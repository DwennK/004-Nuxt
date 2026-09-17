<script setup lang="ts">
import { arcadeGames } from '#shared/constants/arcade'
import { bestTicMove, mergeTileLine } from '#shared/utils/arcade'

definePageMeta({ layout: 'arcade', key: route => String(route.params.id) })
type GameTab = 'wordle' | 'higher' | 'tic' | 'aim' | 'reflex' | 'snake' | 'tiles' | 'connect' | 'mines' | 'memory'
type CellStatus = 'empty' | 'pending' | 'correct' | 'present' | 'absent'
type Cell = { letter: string, status: CellStatus }
type GameStatus = 'playing' | 'won' | 'lost' | 'draw'
type WordLength = 5 | 6 | 7
type HigherHint = 'plus' | 'moins' | 'trouve'
type TicMark = 'X' | 'O'
type AimStatus = 'idle' | 'playing' | 'done'
type ReflexStatus = 'idle' | 'waiting' | 'ready' | 'too-soon' | 'done'
type SnakeStatus = 'idle' | 'playing' | 'paused' | 'won' | 'lost'
type Direction = 'up' | 'right' | 'down' | 'left'
type TileDirection = 'up' | 'right' | 'down' | 'left'
type ConnectDisc = 'player' | 'ai'
type MineCell = { mine: boolean, revealed: boolean, flagged: boolean, adjacent: number }
type MemoryCard = { id: number, value: string, label: string, icon: string, revealed: boolean, matched: boolean }

const games = arcadeGames

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

const selectedGame = computed<GameTab>(() => (isGameTab(routeGameId.value) ? routeGameId.value : 'wordle'))
const selectedGameMeta = computed(() => games.find(game => game.value === selectedGame.value) || games[0]!)
useSeoMeta({ title: () => `${selectedGameMeta.value.label} · Microwest Arcade` })
const clockNow = ref(0)
const expertTic = ref(false)
const flagMode = ref(false)
const helpOpen = ref(false)
const stage = useTemplateRef<HTMLElement>('stage')
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(stage)
const records = useLocalStorage<Record<string, number>>('microwest.arcade.records.v2', {}, { initOnMounted: true })
let clockTimer: number | undefined

const MAX_GUESSES = 6

const WORDS: Record<WordLength, string[]> = {
  5: [
    'MONDE',
    'TABLE',
    'JOUER',
    'FORET',
    'PLAGE',
    'CHIEN',
    'PORTE',
    'VERTE',
    'CHAUD',
    'FROID',
    'BOITE',
    'LIVRE',
    'FLEUR',
    'PIANO',
    'GLACE',
    'HERBE',
    'RADIO',
    'FERME',
    'NUAGE',
    'PLUIE',
    'AVOIR',
    'DANSE',
    'VERRE',
    'VERBE',
    'LIBRE',
    'BANDE',
    'CARTE',
    'POCHE',
    'SABLE',
    'ROUGE',
    'JAUNE',
    'MERCI'
  ],
  6: [
    'MAISON',
    'JARDIN',
    'SOLEIL',
    'VOYAGE',
    'BATEAU',
    'VOLANT',
    'ORANGE',
    'CARNET',
    'PARLER',
    'MANGER',
    'DANSER',
    'SALADE',
    'ECOLES',
    'VOILES',
    'LAMPES',
    'NUAGES',
    'PLUIES',
    'PLAGES',
    'LIVRES',
    'TABLES',
    'ROUGES',
    'POULET',
    'HIVERS'
  ],
  7: [
    'BONJOUR',
    'FAMILLE',
    'CHATEAU',
    'FROMAGE',
    'CUISINE',
    'FENETRE',
    'JARDINS',
    'MAISONS',
    'VOYAGES',
    'JOURNAL',
    'GATEAUX',
    'BOUGIES',
    'CERISES',
    'CHAPEAU',
    'VIOLETS',
    'GARCONS',
    'FUSEAUX',
    'CHANSON',
    'PLANTES',
    'FLEURIR',
    'BLEUETS',
    'CHANTER',
    'MUSIQUE',
    'RECETTE'
  ]
}

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
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
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
    triggerInvalid(`Complète les ${wordLength.value} lettres.`)
    return
  }

  const guess = currentGuess.value
  if (guesses.value.includes(guess)) {
    triggerInvalid('Ce mot a déjà été essayé. Tente une autre combinaison.')
    return
  }
  guesses.value.push(guess)
  currentGuess.value = ''
  wordleMessage.value = null

  if (guess === targetWord.value) {
    finishWordle('won')
    wordleMessage.value = `Bravo ! Trouvé en ${guesses.value.length} coup${guesses.value.length > 1 ? 's' : ''}.`
    return
  }

  if (guesses.value.length >= MAX_GUESSES) {
    finishWordle('lost')
    wordleMessage.value = `Le mot était ${targetWord.value}.`
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

const wordleWinRate = computed(() => {
  if (!wordleStats.value.played) return 0
  return Math.round((wordleStats.value.wins / wordleStats.value.played) * 100)
})

const higherTarget = ref(0)
const higherInput = ref('')
const higherHistory = ref<{ value: number, hint: HigherHint }[]>([])
const higherStatus = ref<GameStatus>('playing')
const higherMessage = ref('Trouve le nombre caché entre 1 et 100 en 8 essais maximum.')
const higherWins = ref(0)
const HIGHER_MAX_ATTEMPTS = 8

function newHigherGame() {
  higherTarget.value = Math.floor(Math.random() * 100) + 1
  higherInput.value = ''
  higherHistory.value = []
  higherStatus.value = 'playing'
  higherMessage.value = 'Trouve le nombre caché entre 1 et 100 en 8 essais maximum.'
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

  const value = Number(higherInput.value)

  if (!Number.isInteger(value) || value < 1 || value > 100) {
    higherMessage.value = 'Entre un nombre entier entre 1 et 100.'
    return
  }

  if (value < higherLow.value || value > higherHigh.value) {
    higherMessage.value = `Ce nombre est déjà éliminé. Essaie entre ${higherLow.value} et ${higherHigh.value}.`
    return
  }

  if (value === higherTarget.value) {
    higherHistory.value.unshift({ value, hint: 'trouve' })
    higherStatus.value = 'won'
    higherWins.value += 1
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
const ticMessage = ref('Tu joues X. Aligne trois symboles avant l’IA.')
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

function getTicWinner(board: (TicMark | null)[], highlight = false) {
  for (const line of ticWinningLines) {
    const [a, b, c] = line
    const first = board[a]

    if (first && first === board[b] && first === board[c]) {
      if (highlight) ticWinningLine.value = line
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
  ticMessage.value = 'Tu joues X. Aligne trois symboles avant l’IA.'
  ticWinningLine.value = []
}

function maybeEndTicRound(board: (TicMark | null)[]) {
  ticWinningLine.value = []
  const winner = getTicWinner(board, true)

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
    ticStatus.value = 'draw'
    ticScores.value.draw += 1
    ticMessage.value = 'Match nul.'
    return true
  }

  return false
}

function chooseTicMove(board: (TicMark | null)[]) {
  if (expertTic.value) return bestTicMove(board)
  const openIndexes = board
    .map((cell, index) => (cell ? null : index))
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
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)]!

  return openIndexes[Math.floor(Math.random() * openIndexes.length)]!
}

function playTic(index: number) {
  if (ticStatus.value !== 'playing' || ticCurrent.value !== 'X') return
  if (ticBoard.value[index]) return

  const nextBoard = [...ticBoard.value]
  nextBoard[index] = 'X'
  ticBoard.value = nextBoard

  if (maybeEndTicRound(nextBoard)) return

  ticCurrent.value = 'O'
  ticMessage.value = 'L’IA réfléchit…'

  ticTimer = window.setTimeout(() => {
    if (ticStatus.value !== 'playing') return

    const aiIndex = chooseTicMove(ticBoard.value)
    const aiBoard = [...ticBoard.value]
    aiBoard[aiIndex] = 'O'
    ticBoard.value = aiBoard

    if (maybeEndTicRound(aiBoard)) return

    ticCurrent.value = 'X'
    ticMessage.value = 'À toi.'
  }, 220)
}

const AIM_TOTAL_TARGETS = 15
const aimStatus = ref<AimStatus>('idle')
const aimHits = ref(0)
const aimMisses = ref(0)
const aimMessage = ref('Touche quinze cibles le plus vite possible.')
const aimStartedAt = ref<number | null>(null)
const aimFinishedAt = ref<number | null>(null)
const aimTarget = ref({ x: 24, y: 28, size: 56 })
const aimBest = ref<number | null>(null)
const aimHistory = ref<number[]>([])

function placeAimTarget() {
  aimTarget.value = {
    x: 14 + Math.random() * 72,
    y: 16 + Math.random() * 68,
    size: Math.max(40, 64 - aimHits.value)
  }
}

function newAimGame() {
  aimStatus.value = 'idle'
  aimHits.value = 0
  aimMisses.value = 0
  aimStartedAt.value = null
  aimFinishedAt.value = null
  aimMessage.value = 'Touche quinze cibles le plus vite possible.'
  placeAimTarget()
}

function startAimGame() {
  aimStatus.value = 'playing'
  aimHits.value = 0
  aimMisses.value = 0
  aimStartedAt.value = performance.now()
  aimFinishedAt.value = null
  aimMessage.value = 'Vise juste et enchaîne.'
  placeAimTarget()
}

function missAimTarget() {
  if (aimStatus.value !== 'playing') return
  aimMisses.value += 1
  aimMessage.value = 'Raté. Continue.'
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
    const duration = Math.round(finishedAt - (aimStartedAt.value ?? finishedAt))
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
  const end = aimFinishedAt.value ?? clockNow.value
  return Math.max(0, Math.round(end - aimStartedAt.value))
})

const aimAccuracy = computed(() => {
  const total = aimHits.value + aimMisses.value
  if (!total) return 100
  return Math.round((aimHits.value / total) * 100)
})

const aimAveragePerTarget = computed(() => {
  if (!aimHits.value || aimStartedAt.value === null) return null
  const elapsed = (aimFinishedAt.value ?? clockNow.value) - aimStartedAt.value
  return Math.max(0, Math.round(elapsed / aimHits.value))
})

const reflexStatus = ref<ReflexStatus>('idle')
const reflexMessage = ref('Attends le vert, puis appuie le plus vite possible.')
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
  reflexMessage.value = 'Attends le vert, puis appuie le plus vite possible.'
  reflexResult.value = null
}

function startReflexRound() {
  clearReflexTimer()
  reflexStatus.value = 'waiting'
  reflexResult.value = null
  reflexMessage.value = 'Prépare-toi… attends le vert.'

  reflexTimer = window.setTimeout(
    () => {
      reflexStatus.value = 'ready'
      reflexStartedAt = performance.now()
      reflexMessage.value = 'Maintenant.'
    },
    1200 + Math.random() * 2200
  )
}

function handleReflexPress() {
  if (reflexStatus.value === 'idle' || reflexStatus.value === 'done' || reflexStatus.value === 'too-soon') {
    startReflexRound()
    return
  }

  if (reflexStatus.value === 'waiting') {
    clearReflexTimer()
    reflexStatus.value = 'too-soon'
    reflexMessage.value = 'Trop tôt ! Appuie pour réessayer.'
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
const snake = ref([
  { x: 5, y: 6 },
  { x: 4, y: 6 },
  { x: 3, y: 6 }
])
const snakeFood = ref({ x: 9, y: 6 })
const snakeDirection = ref<Direction>('right')
const snakeNextDirection = ref<Direction>('right')
const snakeStatus = ref<SnakeStatus>('idle')
const snakeScore = ref(0)
const snakeBest = ref(0)
let snakeTimer: number | undefined
let snakeTurns: Direction[] = []
const snakeLevel = computed(() => 1 + Math.floor(snakeScore.value / 30))
const snakeDelay = computed(() => Math.max(75, 190 - (snakeLevel.value - 1) * 15))

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
  const open = Array.from({ length: SNAKE_SIZE * SNAKE_SIZE }, (_, index) => index).filter(
    index => !occupied.has(index)
  )

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
  snake.value = [
    { x: 5, y: 6 },
    { x: 4, y: 6 },
    { x: 3, y: 6 }
  ]
  snakeDirection.value = 'right'
  snakeNextDirection.value = 'right'
  snakeTurns = []
  snakeStatus.value = 'idle'
  snakeScore.value = 0
  snakeFood.value = { x: 9, y: 6 }
}

function startSnakeGame() {
  if (snakeStatus.value === 'playing') return
  if (snakeStatus.value === 'lost' || snakeStatus.value === 'won') newSnakeGame()
  snakeStatus.value = 'playing'
  snakeTimer = window.setInterval(stepSnake, snakeDelay.value)
}

function setSnakeDirection(direction: Direction) {
  if (snakeStatus.value === 'lost' || snakeStatus.value === 'won' || snakeStatus.value === 'paused') return
  const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
  const last = snakeTurns.at(-1) ?? snakeDirection.value
  if (opposite[last] === direction || snakeTurns.length >= 2) return
  if (last !== direction) snakeTurns.push(direction)
  if (snakeStatus.value === 'idle') startSnakeGame()
}

function toggleSnakePause() {
  if (snakeStatus.value === 'playing') {
    snakeStatus.value = 'paused'
    stopSnakeTimer()
  } else startSnakeGame()
}

function pauseHiddenGame() {
  if (snakeStatus.value === 'playing') toggleSnakePause()
  if (reflexStatus.value === 'waiting' || reflexStatus.value === 'ready') newReflexGame()
}

function stepSnake() {
  if (snakeStatus.value !== 'playing') return

  snakeNextDirection.value = snakeTurns.shift() ?? snakeDirection.value
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
    if (snakeStatus.value === 'playing') {
      stopSnakeTimer()
      snakeTimer = window.setInterval(stepSnake, snakeDelay.value)
    }
  }
}

const tileBoard = ref<number[]>(Array(16).fill(0))
const tileScore = ref(0)
const tileBest = ref(0)
const tileStatus = ref<GameStatus>('playing')
const tileWonOnce = ref(false)
const tileUndo = ref<{ board: number[], score: number, won: boolean } | null>(null)
const tileMoveCount = ref(0)

function emptyTileIndexes(board = tileBoard.value) {
  return board.map((value, index) => (value ? null : index)).filter((value): value is number => value !== null)
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
  tileUndo.value = null
  tileMoveCount.value = 0
  tileBoard.value = spawnTile(spawnTile(Array(16).fill(0)))
  tileScore.value = 0
  tileStatus.value = 'playing'
  tileWonOnce.value = false
}

function undoTiles() {
  if (!tileUndo.value) return
  tileBoard.value = tileUndo.value.board
  tileScore.value = tileUndo.value.score
  tileWonOnce.value = tileUndo.value.won
  tileStatus.value = 'playing'
  tileUndo.value = null
  tileMoveCount.value++
}

function moveTiles(direction: TileDirection) {
  if (tileStatus.value !== 'playing') return

  const before = [...tileBoard.value]
  const next = Array(16).fill(0) as number[]
  let gained = 0

  for (let i = 0; i < 4; i++) {
    const line
      = direction === 'left' || direction === 'right'
        ? [0, 1, 2, 3].map(x => tileBoard.value[i * 4 + x]!)
        : [0, 1, 2, 3].map(y => tileBoard.value[y * 4 + i]!)
    const oriented = direction === 'right' || direction === 'down' ? [...line].reverse() : line
    const merged = mergeTileLine(oriented)
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

  tileUndo.value = { board: before, score: tileScore.value, won: tileWonOnce.value }
  tileMoveCount.value++
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
  if (tileStatus.value === 'won') tileStatus.value = canMoveTiles() ? 'playing' : 'lost'
}

const CONNECT_ROWS = 6
const CONNECT_COLS = 7
const connectBoard = ref<(ConnectDisc | null)[]>(Array(CONNECT_ROWS * CONNECT_COLS).fill(null))
const connectStatus = ref<GameStatus>('playing')
const connectMessage = ref('Dépose un disque. Aligne quatre avant l’IA.')
const connectScores = ref({ player: 0, ai: 0, draw: 0 })
const connectWinningLine = ref<number[]>([])
const connectThinking = ref(false)
let connectTimer: number | undefined

function newConnectGame() {
  connectThinking.value = false
  if (connectTimer) window.clearTimeout(connectTimer)
  connectBoard.value = Array(CONNECT_ROWS * CONNECT_COLS).fill(null)
  connectStatus.value = 'playing'
  connectMessage.value = 'Dépose un disque. Aligne quatre avant l’IA.'
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

function findConnectWinner(board: (ConnectDisc | null)[], highlight = false) {
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
          if (highlight) connectWinningLine.value = line
          return start
        }
      }
    }
  }

  return null
}

function maybeEndConnect(board: (ConnectDisc | null)[]) {
  connectWinningLine.value = []
  const winner = findConnectWinner(board, true)

  if (winner === 'player') {
    connectStatus.value = 'won'
    connectScores.value.player += 1
    connectMessage.value = 'Puissance 4. Tu gagnes.'
    return true
  }

  if (winner === 'ai') {
    connectStatus.value = 'lost'
    connectScores.value.ai += 1
    connectMessage.value = 'L’IA aligne 4 disques.'
    return true
  }

  if (board.every(Boolean)) {
    connectStatus.value = 'draw'
    connectScores.value.draw += 1
    connectMessage.value = 'Grille pleine. Égalité.'
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
      if (findConnectWinner(next) === disc) return col
    }
  }

  // Avoid moves that give the player an immediate winning reply.
  const safe = open.filter((col) => {
    const next = [...board]
    next[connectIndex(availableRow(next, col), col)] = 'ai'
    return !open.some((reply) => {
      const row = availableRow(next, reply)
      if (row < 0) return false
      const response = [...next]
      response[connectIndex(row, reply)] = 'player'
      return findConnectWinner(response) === 'player'
    })
  })
  const candidates = safe.length ? safe : open
  return [3, 2, 4, 1, 5, 0, 6].find(col => candidates.includes(col))!
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
  if (connectStatus.value !== 'playing' || connectThinking.value) return
  if (!dropConnect(col, 'player')) return
  if (maybeEndConnect(connectBoard.value)) return

  connectThinking.value = true
  connectMessage.value = 'L’IA réfléchit…'
  connectTimer = window.setTimeout(() => {
    if (connectStatus.value !== 'playing') return
    dropConnect(chooseConnectColumn(connectBoard.value), 'ai')
    connectThinking.value = false
    if (maybeEndConnect(connectBoard.value)) return
    connectMessage.value = 'À toi.'
  }, 260)
}

const MINE_SIZE = 8
const MINE_COUNT = 10
const minesBoard = ref<MineCell[]>([])
const minesStatus = ref<GameStatus>('playing')
const minesReady = ref(false)
const minesMessage = ref('Premier clic protégé. Ouvre une case ou pose un drapeau.')
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
  flagMode.value = false
  minesBoard.value = emptyMineBoard()
  minesStatus.value = 'playing'
  minesReady.value = false
  minesMessage.value = 'Premier clic protégé. Ouvre une case ou pose un drapeau.'
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
  const board = emptyMineBoard().map((cell, index) => ({ ...cell, flagged: minesBoard.value[index]?.flagged ?? false }))
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
  minesMessage.value = 'Terrain nettoyé !'
}

function revealMine(index: number) {
  if (minesStatus.value !== 'playing') return
  if (minesBoard.value[index]?.flagged) return
  if (!minesReady.value) prepareMines(index)
  const cell = minesBoard.value[index]!
  if (cell.flagged) return
  if (cell.revealed) {
    const neighbors = mineNeighbors(index)
    if (!cell.adjacent || neighbors.filter(next => minesBoard.value[next]!.flagged).length !== cell.adjacent) return
    for (const next of neighbors) {
      if (!minesBoard.value[next]!.revealed && !minesBoard.value[next]!.flagged) revealMine(next)
      if (minesStatus.value !== 'playing') break
    }
    return
  }

  if (cell.mine) {
    minesBoard.value = minesBoard.value.map(mineCell => (mineCell.mine ? { ...mineCell, revealed: true } : mineCell))
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
    minesMessage.value = 'Tous les drapeaux sont déjà posés.'
    return
  }
  const next = [...minesBoard.value]
  next[index] = { ...cell, flagged: !cell.flagged }
  minesBoard.value = next
}

const minesFlagsLeft = computed(() => MINE_COUNT - minesBoard.value.filter(cell => cell.flagged).length)
const minesElapsed = computed(() => {
  if (minesStartedAt.value === null) return 0
  return Math.max(0, Math.floor(((minesFinishedAt.value ?? clockNow.value) - minesStartedAt.value) / 1000))
})

const MEMORY_VALUES = [
  { value: 'ram', label: 'RAM', icon: 'i-lucide-memory-stick' },
  { value: 'usb', label: 'USB', icon: 'i-lucide-usb' },
  { value: 'cpu', label: 'CPU', icon: 'i-lucide-cpu' },
  { value: 'ssd', label: 'SSD', icon: 'i-lucide-hard-drive' },
  { value: 'sim', label: 'SIM', icon: 'i-lucide-card-sim' },
  { value: 'lcd', label: 'LCD', icon: 'i-lucide-monitor' },
  { value: 'wifi', label: 'WiFi', icon: 'i-lucide-wifi' },
  { value: 'gpu', label: 'GPU', icon: 'i-lucide-circuit-board' }
]
const memoryCards = ref<MemoryCard[]>([])
const memoryOpen = ref<number[]>([])
const memoryMoves = ref(0)
const memoryStatus = ref<GameStatus>('playing')
const memoryBest = ref<number | null>(null)
const memoryMessage = ref('Retourne deux cartes et retrouve les huit paires.')
const memoryStartedAt = ref<number | null>(null)
const memoryFinishedAt = ref<number | null>(null)
const memoryCombo = ref(0)
const memoryElapsed = computed(() =>
  memoryStartedAt.value === null
    ? 0
    : Math.max(0, Math.floor(((memoryFinishedAt.value ?? clockNow.value) - memoryStartedAt.value) / 1000))
)
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
  memoryStartedAt.value = null
  memoryFinishedAt.value = null
  memoryCombo.value = 0
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
  memoryMessage.value = 'Retourne deux cartes et retrouve les huit paires.'
}

function flipMemoryCard(index: number) {
  if (memoryStatus.value !== 'playing') return
  if (memoryOpen.value.length >= 2) return
  const card = memoryCards.value[index]!
  if (card.revealed || card.matched) return

  if (memoryStartedAt.value === null) memoryStartedAt.value = performance.now()
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
    memoryCombo.value++
    memoryCards.value = memoryCards.value.map((item, itemIndex) => {
      if (itemIndex === firstIndex || itemIndex === secondIndex) return { ...item, matched: true }
      return item
    })
    memoryOpen.value = []
    memoryMessage.value = 'Paire trouvée !'

    if (memoryCards.value.every(item => item.matched)) {
      memoryStatus.value = 'won'
      memoryFinishedAt.value = performance.now()
      memoryBest.value = memoryBest.value === null ? memoryMoves.value : Math.min(memoryBest.value, memoryMoves.value)
      memoryMessage.value = `Grille terminée en ${memoryMoves.value} coups.`
    }
    return
  }

  memoryCombo.value = 0
  memoryMessage.value = 'Observe bien… puis réessaie.'
  memoryTimer = window.setTimeout(() => {
    memoryCards.value = memoryCards.value.map((item, itemIndex) => {
      if (itemIndex === firstIndex || itemIndex === secondIndex) return { ...item, revealed: false }
      return item
    })
    memoryOpen.value = []
  }, 850)
}

const gameStatus = computed(() => {
  if (selectedGame.value === 'wordle') return wordleStatus.value
  if (selectedGame.value === 'higher') return higherStatus.value
  if (selectedGame.value === 'tic') return ticStatus.value
  if (selectedGame.value === 'aim') return aimStatus.value === 'done' ? 'won' : 'playing'
  if (selectedGame.value === 'reflex')
    return reflexStatus.value === 'done' ? 'won' : reflexStatus.value === 'too-soon' ? 'lost' : 'playing'
  if (selectedGame.value === 'snake') return snakeStatus.value === 'idle' ? 'playing' : snakeStatus.value
  if (selectedGame.value === 'tiles') return tileStatus.value
  if (selectedGame.value === 'connect') return connectStatus.value
  if (selectedGame.value === 'mines') return minesStatus.value
  return memoryStatus.value
})

const gameStatusLabel = computed(() => {
  if (gameStatus.value === 'paused') return 'En pause'
  if (gameStatus.value === 'won')
    return selectedGame.value === 'aim' || selectedGame.value === 'reflex' ? 'Terminé' : 'Victoire'
  if (gameStatus.value === 'lost') return 'À retenter'
  if (gameStatus.value === 'draw') return 'Égalité'
  if (selectedGame.value === 'snake' && snakeStatus.value === 'idle') return 'Prêt'
  if (selectedGame.value === 'aim' && aimStatus.value === 'idle') return 'Prêt'
  if (selectedGame.value === 'reflex' && reflexStatus.value === 'idle') return 'Prêt'
  return 'En cours'
})

const gameMessage = computed(() => {
  if (selectedGame.value === 'wordle')
    return wordleMessage.value || 'Trouve le mot en six essais. Les couleurs te guident.'
  if (selectedGame.value === 'higher') return higherMessage.value
  if (selectedGame.value === 'tic') return ticMessage.value
  if (selectedGame.value === 'aim') return aimMessage.value
  if (selectedGame.value === 'reflex') return reflexMessage.value
  if (selectedGame.value === 'snake') {
    if (snakeStatus.value === 'lost') return 'Collision. Relance pour battre ton score.'
    if (snakeStatus.value === 'won') return 'Plateau complet.'
    if (snakeStatus.value === 'paused') return 'Souffle un peu. Reprends quand tu veux.'
    return 'Un fruit, dix points. Garde une sortie.'
  }
  if (selectedGame.value === 'tiles')
    return tileStatus.value === 'won'
      ? '2048 atteint ! Tu peux continuer.'
      : tileStatus.value === 'lost'
        ? 'Plus aucun mouvement disponible.'
        : 'Fusionne les tuiles avec les flèches ou par glissement.'
  if (selectedGame.value === 'connect') return connectMessage.value
  if (selectedGame.value === 'mines') return minesMessage.value
  return memoryMessage.value
})

const gameStats = computed(() => {
  if (selectedGame.value === 'wordle') {
    return [
      { label: 'Essais', value: `${guesses.value.length}/${MAX_GUESSES}` },
      { label: 'Victoires', value: `${wordleWinRate.value}%` },
      { label: 'Série', value: String(wordleStats.value.streak) },
      { label: 'Record', value: wordleStats.value.best ? String(wordleStats.value.best) : '-' }
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
      { label: 'Précision', value: `${aimAccuracy.value}%` },
      { label: 'Temps', value: aimDuration.value !== null ? `${aimDuration.value} ms` : '-' },
      { label: 'Record', value: aimBest.value !== null ? `${(aimBest.value / 1000).toFixed(2)} s` : '-' }
    ]
  }

  if (selectedGame.value === 'reflex') {
    return [
      { label: 'Dernier', value: reflexResult.value !== null ? `${reflexResult.value} ms` : '-' },
      { label: 'Record', value: reflexBest.value !== null ? `${reflexBest.value} ms` : '-' },
      { label: 'Moyenne', value: averageReflex.value !== null ? `${averageReflex.value} ms` : '-' },
      { label: 'Manches', value: String(reflexHistory.value.length) }
    ]
  }

  if (selectedGame.value === 'snake') {
    return [
      { label: 'Score', value: String(snakeScore.value) },
      { label: 'Record', value: String(snakeBest.value) },
      { label: 'Longueur', value: String(snake.value.length) },
      { label: 'Niveau', value: String(snakeLevel.value) }
    ]
  }

  if (selectedGame.value === 'tiles') {
    return [
      { label: 'Score', value: String(tileScore.value) },
      { label: 'Record', value: String(tileBest.value) },
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
    {
      label: 'Paires',
      value: `${memoryCards.value.filter(card => card.matched).length / 2}/${MEMORY_VALUES.length}`
    },
    { label: 'Record', value: memoryBest.value !== null ? String(memoryBest.value) : '-' },
    { label: 'Temps', value: `${memoryElapsed.value} s` }
  ]
})

function handleKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return

  const target = event.target as HTMLElement | null
  const tagName = target?.tagName?.toLowerCase()
  if (target?.isContentEditable || (tagName && ['input', 'textarea', 'select'].includes(tagName))) return
  if (target?.closest('[role="dialog"], [role="listbox"]')) return
  if (event.key === ' ' && selectedGame.value === 'snake' && tagName !== 'button') {
    event.preventDefault()
    toggleSnakePause()
    return
  }
  if (event.key.toLowerCase() === 'f' && selectedGame.value !== 'wordle') {
    event.preventDefault()
    toggleFullscreen()
    return
  }
  if ((event.key === 'Enter' || event.key === ' ') && target?.closest('button, a')) return

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
      w: 'up',
      W: 'up',
      z: 'up',
      Z: 'up',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      ArrowDown: 'down',
      s: 'down',
      S: 'down',
      ArrowLeft: 'left',
      a: 'left',
      A: 'left',
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
      w: 'up',
      W: 'up',
      z: 'up',
      Z: 'up',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      ArrowDown: 'down',
      s: 'down',
      S: 'down',
      ArrowLeft: 'left',
      a: 'left',
      A: 'left',
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
      best: reflexBest.value,
      history: reflexHistory.value
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
      thinking: connectThinking.value,
      winningLine: connectWinningLine.value
    },
    mines: {
      status: minesStatus.value,
      flagsLeft: minesFlagsLeft.value,
      revealed: minesBoard.value
        .map((cell, index) => ({
          index,
          revealed: cell.revealed,
          flagged: cell.flagged,
          adjacent: cell.revealed ? cell.adjacent : null,
          mine: minesStatus.value !== 'playing' && cell.mine
        }))
        .filter(cell => cell.revealed || cell.flagged || cell.mine)
    },
    memory: {
      status: memoryStatus.value,
      moves: memoryMoves.value,
      elapsed: memoryElapsed.value,
      cards: memoryCards.value.map(card => ({
        revealed: card.revealed,
        matched: card.matched,
        value: card.revealed || card.matched ? card.value : null
      })),
      open: memoryOpen.value,
      matched: memoryCards.value.filter(card => card.matched).length
    }
  })
}

function advanceTime(ms: number) {
  const steps = Math.max(0, Math.floor(ms / snakeDelay.value))
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
  window.addEventListener('blur', pauseHiddenGame)
  document.addEventListener('visibilitychange', onVisibilityChange)
  ;(window as Window & { render_game_to_text?: () => string, advanceTime?: (ms: number) => void }).render_game_to_text
    = gameStateText
  ;(window as Window & { render_game_to_text?: () => string, advanceTime?: (ms: number) => void }).advanceTime
    = advanceTime
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('blur', pauseHiddenGame)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (clockTimer) window.clearInterval(clockTimer)
  if (ticTimer) window.clearTimeout(ticTimer)
  if (connectTimer) window.clearTimeout(connectTimer)
  clearReflexTimer()
  stopSnakeTimer()
  if (memoryTimer) window.clearTimeout(memoryTimer)
  const gameWindow = window as Window & { render_game_to_text?: () => string, advanceTime?: (ms: number) => void }
  if (gameWindow.render_game_to_text === gameStateText) delete gameWindow.render_game_to_text
  if (gameWindow.advanceTime === advanceTime) delete gameWindow.advanceTime
})

function onVisibilityChange() {
  if (document.hidden) pauseHiddenGame()
}

function newGame() {
  const resetters = {
    wordle: newWordleGame,
    higher: newHigherGame,
    tic: newTicGame,
    aim: newAimGame,
    reflex: newReflexGame,
    snake: newSnakeGame,
    tiles: newTileGame,
    connect: newConnectGame,
    mines: newMinesGame,
    memory: newMemoryGame
  }
  resetters[selectedGame.value]()
}

let swipeStart: { x: number, y: number } | null = null
function startSwipe(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0) return
  swipeStart = { x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function endSwipe(event: PointerEvent) {
  if (!swipeStart || !event.isPrimary) return
  const dx = event.clientX - swipeStart.x
  const dy = event.clientY - swipeStart.y
  swipeStart = null
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return
  const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
  if (selectedGame.value === 'snake') setSnakeDirection(direction)
  else moveTiles(direction)
}

function pressAim(event: PointerEvent, target: boolean) {
  if (!event.isPrimary || event.button !== 0) return
  if (target) hitAimTarget()
  else missAimTarget()
}

function saveBest(key: string, value: number | null, lower = false) {
  if (value === null || !Number.isFinite(value) || value < 0) return
  const previous = records.value[key]
  if (typeof previous !== 'number' || !Number.isFinite(previous) || (lower ? value < previous : value > previous)) {
    records.value = { ...records.value, [key]: value }
  }
}

onMounted(() => {
  wordleStats.value.best = records.value[`wordle-${wordLength.value}`] || 0
  for (const [key, target] of [
    ['reflex', reflexBest],
    ['aim', aimBest],
    ['snake', snakeBest],
    ['tiles', tileBest],
    ['memory', memoryBest]
  ] as const) {
    const value = records.value[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) target.value = value
  }
})
watch(
  () => wordleStats.value.best,
  (value) => {
    if (value > 0) saveBest(`wordle-${wordLength.value}`, value, true)
  }
)
watch(reflexBest, value => saveBest('reflex', value, true))
watch(aimBest, value => saveBest('aim', value, true))
watch(snakeBest, value => saveBest('snake', value))
watch(tileBest, value => saveBest('tiles', value))
watch(memoryBest, value => saveBest('memory', value, true))
watch(expertTic, newTicGame)

watch(wordLength, () => {
  wordleStats.value.best = records.value[`wordle-${wordLength.value}`] || 0
  newWordleGame()
})
</script>

<template>
  <main class="arcade-game-page" :style="{ '--game-accent': selectedGameMeta.accent }">
    <nav class="game-breadcrumb" aria-label="Navigation">
      <NuxtLink to="/games"><UIcon name="i-lucide-arrow-left" /> Tous les jeux</NuxtLink><span>{{ selectedGameMeta.category }} <i /> {{ selectedGameMeta.rhythm }}</span>
    </nav>
    <header class="game-heading">
      <div>
        <span class="arcade-eyebrow">MICROWEST / {{ selectedGameMeta.short }}</span>
        <h1>{{ selectedGameMeta.label }}<span>.</span></h1>
        <p>{{ selectedGameMeta.description }}</p>
      </div>
      <div class="game-heading-actions">
        <UButton
          icon="i-lucide-book-open"
          label="Comment jouer"
          variant="ghost"
          color="neutral"
          :aria-expanded="helpOpen"
          @click="helpOpen = !helpOpen"
        /><UButton
          icon="i-lucide-rotate-ccw"
          label="Nouvelle partie"
          class="arcade-secondary"
          @click="newGame"
        />
      </div>
    </header>
    <div v-if="helpOpen" class="arcade-help">
      <UIcon :name="selectedGameMeta.icon" />
      <p>{{ selectedGameMeta.rules }}</p>
      <button type="button" aria-label="Fermer les règles" @click="helpOpen = false">
        <UIcon name="i-lucide-x" />
      </button>
    </div>

    <section
      ref="stage"
      class="arcade-stage"
      :class="{ 'stage-fullscreen': isFullscreen }"
      aria-label="Espace de jeu"
    >
      <div class="stage-toolbar">
        <div class="stage-status" :data-state="gameStatus">
          <span />{{ gameStatusLabel }}
        </div>
        <div class="stage-options">
          <template v-if="selectedGame === 'wordle'">
            <button
              v-for="length in [5, 6, 7] as const"
              :key="length"
              type="button"
              :aria-pressed="wordLength === length"
              @click="wordLength = length"
            >
              {{ length }} lettres
            </button>
          </template>
          <template v-if="selectedGame === 'tic'">
            <button type="button" :aria-pressed="!expertTic" @click="expertTic = false">
              Classique
            </button><button type="button" :aria-pressed="expertTic" @click="expertTic = true">
              Expert
            </button>
          </template>
          <template v-if="selectedGame === 'mines'">
            <button type="button" :aria-pressed="!flagMode" @click="flagMode = false">
              <UIcon name="i-lucide-mouse-pointer-2" /> Ouvrir
            </button><button type="button" :aria-pressed="flagMode" @click="flagMode = true">
              <UIcon name="i-lucide-flag" /> Drapeau
            </button>
          </template>
          <button
            v-if="selectedGame === 'tiles'"
            type="button"
            :disabled="!tileUndo"
            @click="undoTiles"
          >
            <UIcon name="i-lucide-undo-2" /> Annuler
          </button>
          <button
            v-if="selectedGame === 'snake' && (snakeStatus === 'playing' || snakeStatus === 'paused')"
            type="button"
            @click="toggleSnakePause"
          >
            <UIcon :name="snakeStatus === 'paused' ? 'i-lucide-play' : 'i-lucide-pause'" />
            {{ snakeStatus === 'paused' ? 'Reprendre' : 'Pause' }}
          </button>
          <button
            type="button"
            :aria-label="isFullscreen ? 'Quitter le plein écran' : 'Plein écran'"
            :title="isFullscreen ? 'Quitter le plein écran' : 'Plein écran'"
            @click="toggleFullscreen"
          >
            <UIcon :name="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'" />
          </button>
        </div>
      </div>
      <div class="arcade-scorebar">
        <div v-for="stat in gameStats" :key="stat.label">
          <span>{{ stat.label }}</span><strong>{{ stat.value }}</strong>
        </div>
      </div>

      <div class="game-playfield" :class="`playfield-${selectedGame}`">
        <section v-if="selectedGame === 'wordle'" class="wordle-game">
          <div
            class="wordle-board"
            :class="{ 'board-shake': flashInvalid }"
            role="img"
            :aria-label="`Grille de ${wordLength} lettres, ${guesses.length} essais joués`"
          >
            <div v-for="(row, rowIndex) in board" :key="rowIndex" class="wordle-row">
              <div
                v-for="(cell, cellIndex) in row"
                :key="`${rowIndex}-${cellIndex}-${cell.status}`"
                class="wordle-cell"
                :data-state="cell.status"
                :class="{ 'has-letter': cell.letter }"
                :style="{ '--letter-index': cellIndex }"
                :aria-label="`${cell.letter || 'Vide'} : ${cell.status === 'correct' ? 'bien placée' : cell.status === 'present' ? 'mal placée' : cell.status === 'absent' ? 'absente' : 'à valider'}`"
              >
                {{ cell.letter }}
              </div>
            </div>
          </div>
          <div class="wordle-legend">
            <span><i class="legend-correct" /> Bien placée</span><span><i class="legend-present" /> Mal placée</span><span><i class="legend-absent" /> Absente</span>
          </div>
          <div class="wordle-keyboard">
            <div v-for="(row, rowIndex) in KEYBOARD_ROWS" :key="rowIndex">
              <button
                v-for="key in row"
                :key="key"
                type="button"
                :data-state="keyStatuses[key]"
                :class="{ 'key-wide': key === 'ENTER' || key === 'BACK' }"
                :aria-label="key === 'BACK' ? 'Effacer une lettre' : key === 'ENTER' ? 'Valider le mot' : key"
                :disabled="wordleStatus !== 'playing'"
                @click="pressKey(key)"
              >
                <UIcon v-if="key === 'BACK'" name="i-lucide-delete" /><span v-else>{{
                  key === 'ENTER' ? 'OK' : key
                }}</span>
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="selectedGame === 'higher'" class="higher-game">
          <span class="arcade-eyebrow">{{
            higherStatus === 'playing' ? 'LE NOMBRE SE TROUVE ENTRE' : 'LE NOMBRE ÉTAIT'
          }}</span>
          <div class="higher-range">
            <template v-if="higherStatus === 'playing'">
              <strong>{{ higherLow }}</strong><span>—</span><strong>{{ higherHigh }}</strong>
            </template><strong v-else>{{ higherTarget }}</strong>
          </div>
          <div class="higher-track">
            <div :style="{ left: `${higherLow - 1}%`, right: `${100 - higherHigh}%` }" />
          </div>
          <form v-if="higherStatus === 'playing'" class="higher-form" @submit.prevent="submitHigherGuess">
            <UInput
              v-model="higherInput"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              size="xl"
              placeholder="Ton estimation"
              aria-label="Ton estimation"
            /><UButton
              type="submit"
              label="Tester"
              icon="i-lucide-arrow-right"
              class="arcade-primary"
              size="xl"
            />
          </form>
          <div class="higher-attempts" aria-label="Essais disponibles">
            <span v-for="n in HIGHER_MAX_ATTEMPTS" :key="n" :class="{ used: n <= higherHistory.length }" />
          </div>
          <div class="higher-history">
            <span
              v-for="entry in higherHistory"
              :key="entry.value"
            ><strong>{{ entry.value }}</strong><UIcon
              :name="
                entry.hint === 'plus'
                  ? 'i-lucide-arrow-up'
                  : entry.hint === 'moins'
                    ? 'i-lucide-arrow-down'
                    : 'i-lucide-check'
              "
            /><small>{{
              entry.hint === 'plus' ? 'Plus haut' : entry.hint === 'moins' ? 'Plus bas' : 'Trouvé'
            }}</small></span>
          </div>
        </section>

        <section v-else-if="selectedGame === 'tic'" class="tic-game">
          <div class="duel-players">
            <span :class="{ active: ticCurrent === 'X' && ticStatus === 'playing' }"><b>×</b> Toi</span><small>VS</small><span :class="{ active: ticCurrent === 'O' && ticStatus === 'playing' }"><b>○</b> {{ expertTic ? 'Expert' : 'IA' }}</span>
          </div>
          <div class="tic-board">
            <button
              v-for="(cell, index) in ticBoard"
              :key="index"
              type="button"
              :aria-label="`Case ${index + 1}${cell ? ` : ${cell}` : ' libre'}`"
              :disabled="Boolean(cell) || ticCurrent !== 'X' || ticStatus !== 'playing'"
              :class="{ 'winning-cell': ticWinningLine.includes(index) }"
              @click="playTic(index)"
            >
              <span v-if="cell" :class="cell === 'X' ? 'mark-player' : 'mark-ai'">{{ cell === 'X' ? '×' : '○' }}</span><span v-else class="tic-hover">×</span>
            </button>
          </div>
        </section>

        <section
          v-else-if="selectedGame === 'aim'"
          class="aim-arena"
          aria-label="Terrain de précision"
          @pointerdown="pressAim($event, false)"
        >
          <div class="aim-grid" />
          <div v-if="aimStatus !== 'playing'" class="arena-overlay">
            <span class="arena-emblem"><UIcon name="i-lucide-crosshair" /></span><span class="arcade-eyebrow">{{
              aimStatus === 'done' ? 'SÉRIE TERMINÉE' : 'FAIS LE VIDE. VISE JUSTE.'
            }}</span>
            <h2>{{ aimStatus === 'done' ? `${((aimDuration ?? 0) / 1000).toFixed(2)} s` : 'Chaque cible compte.' }}</h2>
            <p>
              {{
                aimStatus === 'done'
                  ? `${aimAccuracy} % de précision · ${aimAveragePerTarget} ms par cible`
                  : '15 cibles à toucher. Le chrono part au lancement.'
              }}
            </p>
            <UButton
              :label="aimStatus === 'done' ? 'Rejouer' : 'Lancer le chrono'"
              icon="i-lucide-play"
              class="arcade-primary"
              size="lg"
              @pointerdown.stop
              @click.stop="startAimGame"
            />
          </div>
          <button
            v-else
            type="button"
            class="aim-target"
            aria-label="Cible"
            :style="{
              left: `${aimTarget.x}%`,
              top: `${aimTarget.y}%`,
              width: `${aimTarget.size}px`,
              height: `${aimTarget.size}px`
            }"
            @pointerdown.stop="pressAim($event, true)"
            @keydown.enter.prevent="!$event.repeat && hitAimTarget()"
            @keydown.space.prevent="!$event.repeat && hitAimTarget()"
            @keyup.space.prevent
            @click.stop="$event.detail === 0 && hitAimTarget()"
          >
            <span /><i />
          </button>
          <div class="aim-counter">
            <span>{{ aimHits.toString().padStart(2, '0') }} <i>/ {{ AIM_TOTAL_TARGETS }}</i></span><span>{{ aimStatus === 'playing' ? ((aimDuration ?? 0) / 1000).toFixed(1) : '0.0' }}<i> s</i></span>
          </div>
        </section>

        <section v-else-if="selectedGame === 'reflex'" class="reflex-game">
          <button
            type="button"
            class="reflex-pad"
            :data-state="reflexStatus"
            @pointerdown.left="$event.isPrimary && handleReflexPress()"
            @keydown.enter.prevent="!$event.repeat && handleReflexPress()"
            @keydown.space.prevent="!$event.repeat && handleReflexPress()"
            @keyup.space.prevent
            @click="$event.detail === 0 && handleReflexPress()"
          >
            <span class="reflex-orbit" /><span class="reflex-orbit second" />
            <span class="reflex-symbol"><UIcon
              :name="
                reflexStatus === 'ready'
                  ? 'i-lucide-zap'
                  : reflexStatus === 'waiting'
                    ? 'i-lucide-ellipsis'
                    : reflexStatus === 'too-soon'
                      ? 'i-lucide-triangle-alert'
                      : reflexStatus === 'done'
                        ? 'i-lucide-check'
                        : 'i-lucide-fingerprint'
              "
            /></span>
            <span class="arcade-eyebrow">{{
              reflexStatus === 'waiting'
                ? 'ATTENDS LE SIGNAL'
                : reflexStatus === 'ready'
                  ? 'MAINTENANT !'
                  : reflexStatus === 'done'
                    ? 'TON TEMPS DE RÉACTION'
                    : reflexStatus === 'too-soon'
                      ? 'FAUX DÉPART'
                      : 'À QUELLE VITESSE RÉAGIS-TU ?'
            }}</span>
            <strong>{{
              reflexStatus === 'ready'
                ? 'APPUIE !'
                : reflexStatus === 'waiting'
                  ? 'Pas encore…'
                  : reflexStatus === 'too-soon'
                    ? 'Trop tôt.'
                    : reflexResult !== null
                      ? reflexResult
                      : 'Prêt ?'
            }}<small v-if="reflexResult !== null">ms</small></strong>
            <span class="reflex-instruction">{{
              reflexStatus === 'waiting'
                ? 'Le vert peut arriver à tout instant.'
                : reflexStatus === 'ready'
                  ? 'Souris, toucher, Entrée ou Espace.'
                  : reflexStatus === 'done'
                    ? 'Appuie pour tenter de faire mieux.'
                    : reflexStatus === 'too-soon'
                      ? 'Appuie pour réessayer.'
                      : 'Appuie ici pour lancer une manche.'
            }}</span>
          </button>
          <div v-if="reflexHistory.length" class="reflex-history">
            <span>DERNIÈRES MANCHES</span><span
              v-for="(time, index) in reflexHistory"
              :key="index"
              :class="{ 'best-time': time === Math.min(...reflexHistory) }"
            >{{ time }}<small> ms</small></span>
          </div>
        </section>

        <section v-else-if="selectedGame === 'snake'" class="snake-game">
          <div
            class="snake-board-wrap"
            @pointerdown="startSwipe"
            @pointerup="endSwipe"
            @pointercancel="swipeStart = null"
          >
            <div class="snake-board" role="img" :aria-label="`Snake, score ${snakeScore}, niveau ${snakeLevel}`">
              <div
                v-for="(cell, index) in snakeCells"
                :key="index"
                class="snake-cell"
                :class="{ 'snake-head': cell.head, 'snake-body': cell.body, 'snake-food': cell.food }"
                :data-direction="cell.head ? snakeDirection : undefined"
              >
                <span v-if="cell.head" class="snake-eyes" /><span v-if="cell.food" />
              </div>
            </div>
            <div v-if="snakeStatus !== 'playing'" class="board-overlay">
              <UIcon
                :name="
                  snakeStatus === 'paused'
                    ? 'i-lucide-pause'
                    : snakeStatus === 'lost'
                      ? 'i-lucide-rotate-ccw'
                      : 'i-lucide-route'
                "
              />
              <h2>
                {{
                  snakeStatus === 'idle'
                    ? 'Prends le virage.'
                    : snakeStatus === 'paused'
                      ? 'Petite pause.'
                      : snakeStatus === 'won'
                        ? 'Plateau complet !'
                        : 'Fin de course.'
                }}
              </h2>
              <p>
                {{
                  snakeStatus === 'idle'
                    ? 'Flèches, glissement ou commandes ci-dessous.'
                    : snakeStatus === 'paused'
                      ? 'Ta trajectoire t’attend.'
                      : `${snakeScore} points · niveau ${snakeLevel}`
                }}
              </p>
              <UButton
                :label="snakeStatus === 'paused' ? 'Reprendre' : snakeStatus === 'idle' ? 'Jouer' : 'Rejouer'"
                icon="i-lucide-play"
                class="arcade-primary"
                @pointerdown.stop
                @pointerup.stop
                @click="startSnakeGame"
              />
            </div>
          </div>
          <div class="direction-pad" aria-label="Direction">
            <button
              type="button"
              class="direction-up"
              aria-label="Haut"
              @pointerdown.left.prevent="setSnakeDirection('up')"
              @click="$event.detail === 0 && setSnakeDirection('up')"
            >
              <UIcon name="i-lucide-arrow-up" />
            </button><button
              type="button"
              aria-label="Gauche"
              @pointerdown.left.prevent="setSnakeDirection('left')"
              @click="$event.detail === 0 && setSnakeDirection('left')"
            >
              <UIcon name="i-lucide-arrow-left" />
            </button><button
              type="button"
              aria-label="Bas"
              @pointerdown.left.prevent="setSnakeDirection('down')"
              @click="$event.detail === 0 && setSnakeDirection('down')"
            >
              <UIcon name="i-lucide-arrow-down" />
            </button><button
              type="button"
              aria-label="Droite"
              @pointerdown.left.prevent="setSnakeDirection('right')"
              @click="$event.detail === 0 && setSnakeDirection('right')"
            >
              <UIcon name="i-lucide-arrow-right" />
            </button>
          </div>
        </section>

        <section v-else-if="selectedGame === 'tiles'" class="tiles-game">
          <div
            class="tiles-board-wrap"
            @pointerdown="startSwipe"
            @pointerup="endSwipe"
            @pointercancel="swipeStart = null"
          >
            <div class="tiles-board">
              <div
                v-for="(value, index) in tileBoard"
                :key="`${index}-${value}-${tileMoveCount}`"
                class="number-tile"
                :data-value="value"
                :class="{ 'tile-large': value >= 1024 }"
                :aria-label="value ? String(value) : 'Vide'"
              >
                {{ value || '' }}
              </div>
            </div>
            <div v-if="tileStatus !== 'playing'" class="board-overlay">
              <UIcon :name="tileStatus === 'won' ? 'i-lucide-trophy' : 'i-lucide-grid-2x2-x'" />
              <h2>{{ tileStatus === 'won' ? '2048. Bien joué !' : 'Plus de place.' }}</h2>
              <p>
                {{ tileScore }} points.
                {{ tileStatus === 'won' ? 'Et si tu visais 4096 ?' : 'Annule le dernier coup ou retente ta chance.' }}
              </p>
              <UButton
                v-if="tileStatus === 'won'"
                label="Continuer"
                class="arcade-primary"
                @pointerdown.stop
                @pointerup.stop
                @click="continueTileGame"
              /><UButton
                v-else-if="tileUndo"
                label="Annuler le dernier coup"
                class="arcade-primary"
                @pointerdown.stop
                @pointerup.stop
                @click="undoTiles"
              /><UButton
                v-else
                label="Rejouer"
                class="arcade-primary"
                @pointerdown.stop
                @pointerup.stop
                @click="newTileGame"
              />
            </div>
          </div>
          <div class="tiles-directions" aria-label="Déplacer les tuiles">
            <button
              v-for="direction in ['left', 'up', 'down', 'right'] as const"
              :key="direction"
              type="button"
              :aria-label="{ left: 'Gauche', up: 'Haut', down: 'Bas', right: 'Droite' }[direction]"
              :disabled="tileStatus !== 'playing'"
              @click="moveTiles(direction)"
            >
              <UIcon :name="`i-lucide-arrow-${direction}`" />
            </button>
          </div>
        </section>

        <section v-else-if="selectedGame === 'connect'" class="connect-game">
          <div class="duel-players">
            <span :class="{ active: !connectThinking && connectStatus === 'playing' }"><b class="player-disc" /> Toi</span><small>VS</small><span :class="{ active: connectThinking }"><b class="ai-disc" /> IA</span>
          </div>
          <div class="connect-board">
            <button
              v-for="col in CONNECT_COLS"
              :key="col"
              type="button"
              class="connect-column"
              :aria-label="`Colonne ${col}${availableRow(connectBoard, col - 1) < 0 ? ' pleine' : ''}`"
              :disabled="connectStatus !== 'playing' || connectThinking || availableRow(connectBoard, col - 1) < 0"
              @click="playConnect(col - 1)"
            >
              <span class="connect-arrow"><UIcon name="i-lucide-chevron-down" /></span><span
                v-for="row in CONNECT_ROWS"
                :key="row"
                class="connect-hole"
                :class="{ 'winning-disc': connectWinningLine.includes(connectIndex(row - 1, col - 1)) }"
              ><span
                v-if="connectBoard[connectIndex(row - 1, col - 1)]"
                :class="connectBoard[connectIndex(row - 1, col - 1)] === 'player' ? 'player-disc' : 'ai-disc'"
              /></span>
            </button>
          </div>
        </section>

        <section v-else-if="selectedGame === 'mines'" class="mines-game">
          <div class="mines-board">
            <button
              v-for="(cell, index) in minesBoard"
              :key="index"
              type="button"
              class="mine-cell"
              :class="{ revealed: cell.revealed, flagged: cell.flagged, exploded: cell.mine && cell.revealed }"
              :data-number="cell.adjacent"
              :disabled="minesStatus !== 'playing'"
              :aria-label="`Case ${index + 1} : ${cell.revealed ? (cell.mine ? 'mine' : `${cell.adjacent} mines voisines`) : cell.flagged ? 'drapeau' : 'cachée'}`"
              @click="flagMode ? toggleMineFlag(index) : revealMine(index)"
              @contextmenu.prevent="toggleMineFlag(index)"
            >
              <UIcon v-if="cell.revealed && cell.mine" name="i-lucide-bomb" /><span
                v-else-if="cell.revealed && cell.adjacent"
              >{{ cell.adjacent }}</span><UIcon v-else-if="cell.flagged" name="i-lucide-flag" />
            </button>
          </div>
          <p class="board-footnote">
            <UIcon name="i-lucide-shield-check" /> Premier clic protégé, voisins compris.
          </p>
        </section>

        <section v-else class="memory-game">
          <div class="memory-board">
            <button
              v-for="(card, index) in memoryCards"
              :key="card.id"
              type="button"
              class="memory-card"
              :class="{ flipped: card.revealed || card.matched, matched: card.matched }"
              :aria-label="
                card.revealed || card.matched
                  ? `${card.label}${card.matched ? ', paire trouvée' : ''}`
                  : `Carte ${index + 1}, cachée`
              "
              :disabled="card.revealed || card.matched || memoryOpen.length >= 2"
              @click="flipMemoryCard(index)"
            >
              <span class="memory-card-inner"><span class="memory-card-back"><span class="memory-card-pattern" /><UIcon name="i-lucide-sparkles" /></span><span class="memory-card-front"><UIcon :name="card.icon" /><span>{{ card.label }}</span><UIcon v-if="card.matched" name="i-lucide-check" class="memory-check" /></span></span>
            </button>
          </div>
          <p class="board-footnote">
            <UIcon :name="memoryCombo > 1 ? 'i-lucide-flame' : 'i-lucide-brain'" />{{
              memoryCombo > 1 ? `${memoryCombo} paires d’affilée. Garde le rythme !` : 'Observe. Retourne. Retrouve.'
            }}
          </p>
        </section>
      </div>

      <div
        v-if="!['reflex', 'aim', 'snake', 'tiles'].includes(selectedGame)"
        class="game-feedback"
        :data-state="gameStatus"
        role="status"
      >
        <span>{{ gameMessage }}</span><UButton
          v-if="['won', 'lost', 'draw'].includes(gameStatus)"
          label="Rejouer"
          icon="i-lucide-rotate-ccw"
          size="sm"
          class="arcade-primary"
          @click="newGame"
        />
      </div>
      <div class="stage-footer">
        <span v-for="hint in selectedGameMeta.controls" :key="hint"><UIcon name="i-lucide-dot" />{{ hint }}</span>
      </div>
    </section>
    <div class="arcade-game-bottom">
      <span><UIcon name="i-lucide-hard-drive" /> {{ ['wordle', 'aim', 'reflex', 'snake', 'tiles', 'memory'].includes(selectedGame) ? 'Les records sont enregistrés sur ce navigateur.' : 'Les scores sont ceux de cette session.' }}</span><NuxtLink to="/games">Changer de jeu <UIcon name="i-lucide-arrow-right" /></NuxtLink>
    </div>
    <nav class="game-switcher" aria-label="Autres jeux">
      <NuxtLink
        v-for="game in games"
        :key="game.value"
        :to="`/games/${game.value}`"
        :aria-current="selectedGame === game.value ? 'page' : undefined"
        :style="{ '--item-accent': game.accent }"
      ><UIcon :name="game.icon" /><span>{{ game.label }}</span></NuxtLink>
    </nav>
  </main>
</template>
