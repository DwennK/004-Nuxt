import { computed, readonly, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCapabilities } from '../../app/composables/useCapabilities'
import { listCapabilities } from '../../shared/utils/capabilities'

describe('client session capabilities', () => {
  beforeEach(() => {
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('readonly', readonly)
  })

  it('uses only the capability names exposed by the session', () => {
    const user = ref({
      id: 2,
      email: 'operator@example.test',
      name: 'Operator',
      isAdmin: false,
      capabilities: listCapabilities({ isAdmin: false })
    })
    vi.stubGlobal('useUserSession', () => ({ user }))

    const { capabilities, can } = useCapabilities()

    expect(capabilities.value).toEqual(['financial:read', 'financial:record'])
    expect(can('financial:record')).toBe(true)
    expect(can('financial:adjust')).toBe(false)
    expect(can('records:delete')).toBe(false)
  })

  it('reacts when an admin session replaces an operator session', () => {
    const user = ref({
      id: 2,
      email: 'operator@example.test',
      name: 'Operator',
      isAdmin: false,
      capabilities: listCapabilities({ isAdmin: false })
    })
    vi.stubGlobal('useUserSession', () => ({ user }))

    const { can } = useCapabilities()
    expect(can('records:delete')).toBe(false)

    user.value = {
      ...user.value,
      isAdmin: true,
      capabilities: listCapabilities({ isAdmin: true })
    }

    expect(can('records:delete')).toBe(true)
    expect(can('financial:adjust')).toBe(true)
  })
})
