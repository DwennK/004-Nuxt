import { describe, expect, it } from 'vitest'
import {
  defaultBatchSize,
  defaultMaxBatches,
  maximumBatchCount,
  maximumBatchSize,
  resolveBackfillBounds
} from '../../scripts/db/backfill-document-totals.mjs'

describe('document totals backfill bounds', () => {
  it('uses a finite default write window', () => {
    expect(resolveBackfillBounds()).toEqual({
      afterId: 0,
      batchSize: defaultBatchSize,
      maxBatches: defaultMaxBatches,
      maxDocuments: defaultBatchSize * defaultMaxBatches
    })
  })

  it('parses an explicit resumable cursor and bounded window', () => {
    expect(resolveBackfillBounds({
      afterId: '42',
      batchSize: '25',
      maxBatches: '4'
    })).toEqual({
      afterId: 42,
      batchSize: 25,
      maxBatches: 4,
      maxDocuments: 100
    })
  })

  it('rejects invalid or excessive write windows', () => {
    expect(() => resolveBackfillBounds({ batchSize: '0' })).toThrow('--batch-size')
    expect(() => resolveBackfillBounds({ batchSize: String(maximumBatchSize + 1) })).toThrow('--batch-size')
    expect(() => resolveBackfillBounds({ maxBatches: String(maximumBatchCount + 1) })).toThrow('--max-batches')
    expect(() => resolveBackfillBounds({ afterId: '-1' })).toThrow('--after-id')
    expect(() => resolveBackfillBounds({ batchSize: '1.5' })).toThrow('--batch-size')
  })
})
