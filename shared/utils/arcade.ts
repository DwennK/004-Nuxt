export type TicSymbol = 'X' | 'O' | null
export const ticLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
] as const

export function ticWinner(board: TicSymbol[]) {
  return ticLines.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c])
}

export function bestTicMove(board: TicSymbol[]): number {
  function score(position: TicSymbol[], turn: 'X' | 'O', depth: number): number {
    const line = ticWinner(position)
    if (line) return position[line[0]] === 'O' ? 10 - depth : depth - 10
    if (position.every(Boolean)) return 0
    const scores = position.flatMap((cell, index) => {
      if (cell) return []
      const next = [...position]
      next[index] = turn
      return [score(next, turn === 'O' ? 'X' : 'O', depth + 1)]
    })
    return turn === 'O' ? Math.max(...scores) : Math.min(...scores)
  }
  let best = -Infinity
  let move = -1
  for (const index of [4, 0, 2, 6, 8, 1, 3, 5, 7]) {
    if (board[index]) continue
    const next = [...board]
    next[index] = 'O'
    const value = score(next, 'X', 0)
    if (value > best) {
      best = value
      move = index
    }
  }
  return move
}

export function mergeTileLine(line: number[]) {
  const compact = line.filter(Boolean)
  const merged: number[] = []
  let gained = 0
  for (let i = 0; i < compact.length; i++) {
    if (compact[i] === compact[i + 1]) {
      const value = compact[i]! * 2
      merged.push(value)
      gained += value
      i++
    } else merged.push(compact[i]!)
  }
  while (merged.length < 4) merged.push(0)
  return { line: merged, gained }
}
