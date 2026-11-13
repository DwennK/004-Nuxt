import { describe, expect, it } from 'vitest'
import { findRepairCopy, repairCopyRules, repairCopyUpdate, repairName } from '../../shared/utils/repair-copy'
import { buildRepairCatalogSeedItems } from '../../server/utils/pos/repair-service-seed'
import { matchRepair } from '../../scripts/mobilesentrix/match.mjs'

describe('repair catalogue copy', () => {
  const item = { type: 'repair', name: 'Caméra arrière Galaxy S23 Ultra 5G', model: 'Galaxy S23 Ultra 5G', serviceKind: 'Caméra arrière' }

  it('converts legacy copy and is idempotent', () => {
    const update = repairCopyUpdate(item)!
    expect(update).toEqual({ name: 'Caméra arrière — Galaxy S23 Ultra 5G', serviceKind: 'Remplacement du module caméra concerné. La vitre de protection est une réparation distincte.' })
    expect(repairCopyUpdate({ ...item, ...update })).toBeNull()
  })

  it('preserves custom descriptions, custom titles and unknown repairs', () => {
    expect(repairCopyUpdate({ ...item, serviceKind: 'Remplacement du téléobjectif uniquement.' })?.serviceKind).toBe('Remplacement du téléobjectif uniquement.')
    expect(repairCopyUpdate({ ...item, name: 'Téléobjectif S23 Ultra' })?.name).toBe('Téléobjectif S23 Ultra')
    expect(repairCopyUpdate({ ...item, name: 'Microsoudure', serviceKind: 'Réparation de la carte mère' })).toBeNull()
    expect(repairCopyUpdate({ ...item, serviceKind: 'Remplacement batterie' })).toBeNull()
    expect(repairCopyUpdate({ ...item, type: 'service' })).toBeNull()
    expect(repairCopyUpdate({ ...item, serviceKind: null })?.serviceKind).toContain('module caméra')
  })

  it('uses the same rules for seed items and normalizes every legacy label', () => {
    for (const rule of repairCopyRules) {
      for (const label of [rule.label, ...rule.legacyLabels, rule.description]) expect(findRepairCopy(label)?.key).toBe(rule.key)
    }
    for (const seed of buildRepairCatalogSeedItems()) {
      const rule = findRepairCopy(seed.serviceKind)!
      expect(rule).toBeDefined()
      expect(seed.name).toBe(repairName(rule, seed.model))
      expect(repairCopyUpdate(seed)).toBeNull()
    }
  })

  it('keeps supplier matching with descriptive copy and distinguishes glass from camera', () => {
    const products = [
      { sku: 'glass', name: 'Back Camera Lens (Glass Only) For iPhone 13 (Premium)', entity_id: '1', url: 'https://example.com/glass' },
      { sku: 'camera', name: 'Back Camera For iPhone 13 (Premium)', entity_id: '2', url: 'https://example.com/camera' }
    ]
    for (const [key, sku] of [['camera_lens', 'glass'], ['rear_camera', 'camera']]) {
      const rule = repairCopyRules.find(rule => rule.key === key)!
      expect(matchRepair({ brand: 'Apple', model: 'iPhone 13', service_kind: rule.description }, products).reference?.sku).toBe(sku)
    }
    expect(findRepairCopy('Ne pas remplacer la caméra arrière')).toBeUndefined()
  })
})
