import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecordScan } from '../../app/composables/useRecordScan'

const fetchRecord = vi.fn()
const navigate = vi.fn()
const addToast = vi.fn()

beforeEach(() => {
  vi.stubGlobal('useRequestURL', () => new URL('https://pos.example.test/'))
  vi.stubGlobal('useToast', () => ({ add: addToast }))
  vi.stubGlobal('$fetch', fetchRecord)
  vi.stubGlobal('navigateTo', navigate)
  fetchRecord.mockResolvedValue({ id: 42 })
})

describe('camera record lookup', () => {
  it('checks access before closing search and navigating', async () => {
    const search = ref('previous search')
    const close = vi.fn()
    await useRecordScan(search, close)('https://pos.example.test/documents/42')
    expect(fetchRecord).toHaveBeenCalledWith('/api/documents/42')
    expect(close).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/documents/42')
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]!)
    expect(search.value).toBe('previous search')
  })

  it.each([401, 403, 404, 500])('keeps the search open and explains a %s response', async (statusCode) => {
    fetchRecord.mockRejectedValueOnce({ statusCode })
    const close = vi.fn()
    await useRecordScan(ref(''), close)('https://pos.example.test/tickets/42')
    expect(navigate).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })

  it('preserves barcode search and rejects foreign QR navigation', async () => {
    const search = ref('')
    const scan = useRecordScan(search)
    await scan('7612345678900')
    expect(search.value).toBe('7612345678900')
    await scan('https://foreign.test/documents/42')
    expect(search.value).toBe('7612345678900')
    expect(fetchRecord).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ color: 'warning' }))
  })

  it('ignores duplicate scans while resolving a record', async () => {
    let resolve!: () => void
    fetchRecord.mockReturnValueOnce(new Promise<void>((done) => {
      resolve = done
    }))
    const scan = useRecordScan(ref(''))
    const first = scan('https://pos.example.test/tickets/42')
    await scan('https://pos.example.test/tickets/42')
    resolve()
    await first
    expect(fetchRecord).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledOnce()
  })
})
