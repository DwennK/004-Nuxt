import { describe, expect, it, vi } from 'vitest'
import { useFormAction } from '../../app/composables/useFormAction'
import { useApiAction } from '../../app/composables/useApiAction'
import { getRequestErrorMessage } from '../../app/utils/request-error'

function setup() {
  const toast = { add: vi.fn() }
  vi.stubGlobal('useToast', () => toast)
  vi.stubGlobal('useApiAction', useApiAction)
  vi.stubGlobal('getRequestErrorMessage', getRequestErrorMessage)
  return { ...useFormAction(), toast }
}

describe('form submission feedback', () => {
  it('keeps saving visible and ignores duplicate submits until the request resolves', async () => {
    const form = setup()
    let finish!: (value: number) => void
    const action = vi.fn(() => new Promise<number>((resolve) => {
      finish = resolve
    }))
    const pending = form.save(action, { success: 'Client enregistré' })
    expect(form.isSaving.value).toBe(true)
    expect(await form.save(action)).toBeUndefined()
    expect(action).toHaveBeenCalledTimes(1)
    finish(42)
    expect(await pending).toEqual({ ok: true, data: 42 })
    expect(form.isSaving.value).toBe(false)
    expect(form.toast.add).toHaveBeenCalledTimes(1)
  })

  it('keeps actionable error feedback after failure and clears it when retrying', async () => {
    const form = setup()
    const error = { data: { statusMessage: 'Ce SKU existe déjà.' } }
    expect(await form.save(() => Promise.reject(error))).toEqual({ ok: false, error })
    expect(form.isSaving.value).toBe(false)
    expect(form.saveError.value).toBe('Ce SKU existe déjà.')
    expect(form.toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: 'Enregistrement impossible' }))
    const retry = form.save(async () => 'saved')
    expect(form.saveError.value).toBeNull()
    expect(await retry).toEqual({ ok: true, data: 'saved' })
  })

  it('offers a retry hint for failures without an actionable server message', async () => {
    const form = setup()
    await form.save(() => Promise.reject(null))
    expect(form.saveError.value).toBe('Vérifiez les informations saisies et la connexion puis réessayez.')
    form.clearSaveError()
    expect(form.saveError.value).toBeNull()
  })
})
