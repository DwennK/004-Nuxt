let posSchemaPromise: Promise<void> | null = null

// Zero database I/O and no legacy-module loading unless explicitly enabled locally.
export async function ensurePosSchema() {
  if (!posSchemaPromise) {
    posSchemaPromise = (async () => {
      if (useRuntimeConfig().posAllowRuntimeSchemaBootstrap !== true) return
      const { bootstrapLegacyPosSchema } = await import('../../legacy/pos-bootstrap')
      await bootstrapLegacyPosSchema()
    })().catch((error) => {
      posSchemaPromise = null
      throw error
    })
  }
  return posSchemaPromise
}
