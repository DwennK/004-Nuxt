import { UNSAVED_REMINDER_MS } from '../types/dossier'

/** Pure clock policy, shared by the UI and fake-clock tests. */
export function createUnsavedReminder() {
  let dueAt: number | null = null
  let muted = false
  return {
    change(dirty: boolean, now: number) {
      dueAt = dirty ? now + UNSAVED_REMINDER_MS : null
      if (!dirty) muted = false
    },
    mute() {
      muted = true
    },
    tick(now: number) {
      if (muted || dueAt === null || now < dueAt) return false
      dueAt = now + UNSAVED_REMINDER_MS
      return true
    }
  }
}
