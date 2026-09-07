import { describe, expect, it } from 'vitest'
import { getRequestErrorMessage } from '../../app/utils/request-error'

describe('user-facing request errors', () => {
  it('prefers actionable server explanations over request internals', () => {
    expect(getRequestErrorMessage({ data: { statusMessage: 'Ce SKU existe déjà.', message: 'Internal Server Error' } })).toBe('Ce SKU existe déjà.')
  })
  it('does not expose SQL queries or their submitted values', () => {
    expect(getRequestErrorMessage({ data: { message: 'Failed query: insert into customers params: private data' }, message: '[POST] /api/customers: 500' })).toBeNull()
  })
  it('explains connection failures without displaying fetch jargon', () => {
    expect(getRequestErrorMessage(new Error('Failed to fetch'))).toBe('Connexion interrompue. Vérifiez le réseau puis réessayez.')
  })
})
