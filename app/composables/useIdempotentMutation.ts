import { serializeIdempotencyPayload } from '~~/shared/lib/idempotency'

type MutationAttempt = {
  identity: string
  key: string
  payload: unknown
}

export function useIdempotentMutation() {
  const attempts = new Map<string, MutationAttempt>()

  function getAttempt<T>(scope: string, identity: unknown, createPayload: () => T) {
    const serializedIdentity = serializeIdempotencyPayload(identity)
    const existing = attempts.get(scope)

    if (existing?.identity === serializedIdentity) {
      return {
        key: existing.key,
        payload: existing.payload as T
      }
    }

    const attempt: MutationAttempt = {
      identity: serializedIdentity,
      key: crypto.randomUUID(),
      payload: createPayload()
    }

    attempts.set(scope, attempt)

    return {
      key: attempt.key,
      payload: attempt.payload as T
    }
  }

  function complete(scope: string) {
    attempts.delete(scope)
  }

  return {
    getAttempt,
    complete
  }
}
