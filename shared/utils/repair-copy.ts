// Commercial copy only: do not infer part quality, warranty, checks or outcomes.
// Model-specific details belong in the item's editable description.
export const repairCopyRules = [
  { key: 'screen', label: 'Écran', legacyLabels: ['Remplacement écran', 'Ecran'], description: 'Remplacement du bloc écran comprenant l’affichage et la surface tactile.' },
  { key: 'battery', label: 'Batterie', legacyLabels: ['Remplacement batterie'], description: 'Retrait de l’ancienne batterie et installation d’une batterie neuve.' },
  { key: 'chassis', label: 'Châssis / cadre', legacyLabels: ['Chassis'], description: 'Remplacement du cadre de l’appareil et transfert des composants dans le nouveau châssis.' },
  { key: 'back_glass', label: 'Face arrière', legacyLabels: [], description: 'Remplacement de la vitre ou du cache arrière, selon le modèle.' },
  { key: 'rear_camera', label: 'Caméra arrière', legacyLabels: [], description: 'Remplacement du module caméra concerné. La vitre de protection est une réparation distincte.' },
  { key: 'front_camera', label: 'Caméra avant', legacyLabels: [], description: 'Remplacement du module caméra avant utilisé pour les selfies et les appels vidéo.' },
  { key: 'camera_lens', label: 'Vitre de caméra', legacyLabels: ['Lentille caméra'], description: 'Remplacement de la vitre de protection de l’objectif, sans remplacement du module caméra.' },
  { key: 'charge_port', label: 'Connecteur de charge', legacyLabels: ['Port de charge'], description: 'Remplacement du connecteur utilisé pour la recharge par câble.' },
  { key: 'earpiece', label: 'Écouteur d’appel', legacyLabels: ['Haut-parleur oreille'], description: 'Remplacement du haut-parleur utilisé pour entendre votre interlocuteur lorsque le téléphone est porté à l’oreille.' }
] as const

export type RepairCopyRule = (typeof repairCopyRules)[number]

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Exact known labels/descriptions only; never guess from words in custom copy. */
export function findRepairCopy(value: string | null | undefined) {
  if (!value?.trim()) return undefined
  return repairCopyRules.find(rule => [rule.label, ...rule.legacyLabels, rule.description]
    .some(label => normalize(label) === normalize(value)))
}

export function repairName(rule: RepairCopyRule, model?: string | null) {
  return model?.trim() ? `${rule.label} — ${model.trim()}` : rule.label
}

/** Recognize generated titles, leaving model-specific or manually written titles alone. */
export function findRepairCopyByName(name: string, model?: string | null) {
  return repairCopyRules.find(rule => [rule.label, ...rule.legacyLabels].some((label) => {
    const names = model?.trim() ? [`${label} ${model.trim()}`, `${label} — ${model.trim()}`] : [label]
    return names.some(candidate => normalize(candidate) === normalize(name))
  }))
}

export function repairCopyUpdate(item: { type: string, name: string, model?: string | null, serviceKind?: string | null }) {
  if (item.type !== 'repair') return null
  const nameRule = findRepairCopyByName(item.name, item.model)
  const descriptionRule = findRepairCopy(item.serviceKind)
  // Conflicting recognized fields need a human decision.
  if (nameRule && descriptionRule && nameRule.key !== descriptionRule.key) return null
  const rule = descriptionRule || nameRule
  if (!rule) return null
  const name = nameRule ? repairName(rule, item.model) : item.name
  const serviceKind = !item.serviceKind?.trim() || descriptionRule ? rule.description : item.serviceKind
  return name === item.name && serviceKind === item.serviceKind ? null : { name, serviceKind }
}
