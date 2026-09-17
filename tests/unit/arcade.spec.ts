import { describe, expect, it } from 'vitest'
import { bestTicMove, mergeTileLine, ticWinner, type TicSymbol } from '../../shared/utils/arcade'

describe('2048 merging', () => {
  it.each([
    [[2, 2, 2, 2], [4, 4, 0, 0], 8],
    [[2, 2, 4, 0], [4, 4, 0, 0], 4],
    [[4, 0, 4, 4], [8, 4, 0, 0], 8],
    [[0, 2, 0, 4], [2, 4, 0, 0], 0],
    [[1024, 1024, 0, 0], [2048, 0, 0, 0], 2048],
    [[0, 0, 0, 0], [0, 0, 0, 0], 0]
  ])('merges %j once per tile, with the correct score', (input, output, score) => {
    const before = [...(input as number[])]
    expect(mergeTileLine(input as number[])).toEqual({ line: output, gained: score })
    expect(input).toEqual(before)
  })
})

describe('expert tic-tac-toe', () => {
  it('takes a winning move and leaves the board unchanged', () => {
    const board: TicSymbol[] = ['O', 'O', null, 'X', 'X', null, 'X', null, null]
    expect(bestTicMove(board)).toBe(2)
    expect(board[2]).toBeNull()
  })

  it('cannot lose against any legal sequence of player moves', () => {
    let completedGames = 0
    function visit(board: TicSymbol[]) {
      const winningLine = ticWinner(board)
      if (winningLine) {
        expect(board[winningLine[0]]).toBe('O')
        completedGames++
        return
      }
      if (board.every(Boolean)) {
        completedGames++
        return
      }
      for (let i = 0; i < 9; i++) {
        if (board[i]) continue
        const next = [...board]
        next[i] = 'X'
        // Detect a player win before letting the AI respond.
        expect(ticWinner(next)).toBeUndefined()
        if (!next.every(Boolean)) {
          const move = bestTicMove(next)
          expect(move).toBeGreaterThanOrEqual(0)
          expect(next[move]).toBeNull()
          next[move] = 'O'
        }
        visit(next)
      }
    }
    visit(Array<TicSymbol>(9).fill(null))
    expect(completedGames).toBeGreaterThan(100)
  })
})
