import { describe, expect, it } from 'vitest'
import { createUnsavedReminder } from '../../shared/utils/unsaved-reminder'

describe('unsaved reminder clock', () => {
  it('waits five minutes after the latest input and repeats without playing missed beeps in a burst', () => {
    const reminder = createUnsavedReminder()
    reminder.change(true, 0)
    expect(reminder.tick(299_999)).toBe(false)
    reminder.change(true, 290_000)
    expect(reminder.tick(300_000)).toBe(false)
    expect(reminder.tick(590_000)).toBe(true)
    expect(reminder.tick(590_001)).toBe(false)
    expect(reminder.tick(2_000_000)).toBe(true)
    expect(reminder.tick(2_000_001)).toBe(false)
  })
  it('silences until saving or discarding, including further input and failed saves', () => {
    const reminder = createUnsavedReminder()
    reminder.change(true, 0)
    reminder.mute()
    reminder.change(true, 100)
    expect(reminder.tick(500_000)).toBe(false)
    reminder.change(false, 500_000)
    expect(reminder.tick(900_000)).toBe(false)
    reminder.change(true, 1_000_000)
    expect(reminder.tick(1_300_000)).toBe(true)
  })
})
