export const rulesVersion = 3
export const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')

function modelsIn(value) {
  const text = normalize(value)
  const apple = text.match(/iphone\s+(?:se(?:\s+(?:2016|2020|2022))?|(?:\d{1,2}(?:s|e)?|xs|xr|x)(?:\s+(?:pro max|pro|plus|mini|max))?)(?![a-z0-9])/g) || []
  if (/iphone se 2020 2022\b/.test(text)) apple.push('iphone se 2020', 'iphone se 2022')
  const samsung = text.match(/(?:galaxy\s+)?s\d{1,2}(?:\s*e|\s+lite|\s+fe)?(?:\s+(?:plus|ultra))?(?:\s+5g)?(?![a-z0-9])/g) || []
  return [...apple, ...samsung.map(model => `galaxy ${model.replace(/^galaxy /, '').replace(/s(\d+) e\b/, 's$1e')}`)]
}

export function requiredModels(repair) {
  const model = normalize(repair.model)
  if (model === 'iphone se 2020 2022') return ['iphone se 2020', 'iphone se 2022']
  // These catalogue names omit 5G although the generation only has that connectivity.
  const aliases = { 'galaxy s21': 'galaxy s21 5g', 'galaxy s21 fe': 'galaxy s21 fe 5g' }
  return [aliases[model] || model]
}

export function modelsMatch(repair, product) {
  const compatibility = Array.isArray(product.compatibility)
    ? product.compatibility.map(item => typeof item === 'string' ? item : item?.model_text || item?.model || item?.name || '').join(' ')
    : ''
  const found = new Set(modelsIn(`${product.model_text || ''} ${product.name || product.title || ''} ${compatibility}`))
  for (const model of [...found]) {
    if (model === 'galaxy s21' || model === 'galaxy s21 fe') found.add(`${model} 5g`)
  }
  return requiredModels(repair).every(model => found.has(model))
}

const parts = {
  'remplacement ecran': ['display', /(?:oled|lcd|display) assembly/],
  'remplacement batterie': ['battery', /(?:replacement )?battery/],
  'camera arriere': ['rear-camera', /(?:rear|back) camera/],
  'camera avant': ['front-camera', /front camera/],
  'chassis cadre': ['housing', /(?:housing|back cover with frame|rear case)/],
  'face arriere': ['back', /(?:back (?:cover|glass)|rear glass)/],
  'haut parleur oreille': ['earpiece', /(?:earpiece|ear speaker)/],
  'lentille camera': ['lens', /camera lens/],
  'port de charge': ['charging', /(?:charging|charge) port/]
}

export function partMatches(repair, product) {
  const part = parts[normalize(repair.service_kind || repair.serviceKind)]
  const title = normalize(product.name || product.title)
  if (!part || !part[1].test(title)) return false
  if (/\b(?:adaptor|adapter|programmer|repair tool|tag on|read and write|stencil|solder|protector|sticker|connector only|board only)\b/.test(title)) return false
  if (/\badhesive\b/.test(title) && !(part[0] === 'lens' && /glass only/.test(title))) return false
  if (part[0] === 'battery' && /\b(?:flex|board|connector|tester|case|cell|without bms|no bms)\b/.test(title)) return false
  if (['rear-camera', 'front-camera'].includes(part[0]) && /\b(?:lens|bracket|holder)\b/.test(title)) return false
  if (part[0] === 'back' && /\b(?:housing|with frame)\b/.test(title)) return false
  if (part[0] === 'lens' && /back cover/.test(title)) return false
  return true
}

export function qualityRank(repair, product) {
  const title = normalize(product.name || product.title)
  const kind = parts[normalize(repair.service_kind || repair.serviceKind)]?.[0]
  const apple = normalize(repair.brand) === 'apple'
  if (kind === 'display') return apple
    ? (/xo7 soft/.test(title) && !/xo7 3 0/.test(title) ? 0 : null)
    : (/service pack/.test(title) ? 0 : null)
  if (kind === 'battery') {
    if (apple) return /ampsentrix plus/.test(title) && !/extended/.test(title) ? 0 : null
    return /ampsentrix pro/.test(title) ? 0 : /service pack/.test(title) ? 1 : null
  }
  if (apple && ['housing', 'back'].includes(kind)) return /(?:used oem pull|oem pull).*grade a\b/.test(title) ? 0 : null
  if (apple) return /premium/.test(title) ? 0 : /aftermarket plus/.test(title) ? 1 : null
  if (/service pack/.test(title)) return 0
  if (['back', 'charging'].includes(kind)) return null
  // Explicit known alternatives only; an unlabeled quality never becomes a match.
  return /premium/.test(title) ? 1 : /aftermarket plus/.test(title) ? 2 : /\baftermarket\b/.test(title) ? 3 : null
}

function ambiguity(repair, product) {
  const title = normalize(product.name)
  const detail = normalize(`${product.name} ${product.description || ''} ${product.specification_text || ''}`)
  const kind = parts[normalize(repair.service_kind || repair.serviceKind)]?.[0]
  const color = normalize(product.color_text)
  const reasons = []
  if (/\b(?:[2-9]|\d{2,}) pack\b/.test(title)) reasons.push('Conditionnement en lot à choisir')
  if (kind === 'rear-camera' && (normalize(repair.brand) === 'samsung' || /\b(?:telephoto|ultra wide|wide angle|periscope|depth|macro|\d+mp)\b/.test(title))) reasons.push('Module photo ou ensemble complet à préciser')
  if (/\b(?:usa|us version|us model|us variant|verizon|at t|t mobile|sprint)\b/.test(title)) reasons.push('Version américaine exclue')
  if (normalize(repair.brand) === 'apple' && ['housing', 'back', 'charging'].includes(kind)
    && !/\b(?:europe|european|eu global version|eu version|eu model|international version|international model)\b/.test(detail)) reasons.push('Compatibilité Europe à confirmer')
  if (kind === 'display' && normalize(repair.brand) === 'samsung') reasons.push('Choisir avec ou sans cadre')
  if ((color && !['all colors', 'universal', 'n a'].includes(color))
    || /\b(?:black|white|midnight|starlight|blue|green|red|gold|silver|purple|pink|graphite|titanium)\b/.test(title)) reasons.push('Couleur à choisir')
  return reasons
}

function isUsVariant(product) {
  const variant = normalize(`${product.name} ${product.specification_text || ''} ${product.device_carrier_text || ''}`)
  return /\b(?:usa|us|verizon|at t|t mobile|sprint|sm [a-z]\d{3}u1?)\b/.test(variant)
}

export function matchRepair(repair, products, complete = true) {
  if (!complete) return { status: 'blocked', note: 'Recherche ou fiches détaillées incomplètes', candidates: [] }
  const candidates = products.filter(p => modelsMatch(repair, p) && partMatches(repair, p))
    .map(p => ({ p, rank: qualityRank(repair, p) })).filter(c => c.rank !== null)
    .filter(({ p }) => !isUsVariant(p))
  if (!candidates.length) return { status: 'not_found', note: 'Aucune pièce confirmée dans les gammes et modèles retenus', candidates: [] }
  const bestRank = Math.min(...candidates.map(c => c.rank))
  const best = [...new Map(candidates.filter(c => c.rank === bestRank).map(c => [c.p.sku, c.p])).values()]
  const summaries = best.map(p => ({
    sku: String(p.sku), productId: String(p.entity_id), url: p.url, name: p.name,
    color: p.color_text || null, inStock: p.is_in_stock ?? null, reasons: ambiguity(repair, p)
  }))
  const certain = summaries.length === 1 && !summaries[0].reasons.length
  return {
    status: certain ? 'matched' : 'variant_required',
    note: certain ? 'Modèle, pièce et gamme confirmés sur la fiche fournisseur' : [...new Set(['Choix de variante nécessaire', ...summaries.flatMap(c => c.reasons)])].join(' ; '),
    candidates: summaries,
    ...(certain ? { reference: { sku: summaries[0].sku, productId: summaries[0].productId, url: summaries[0].url } } : {})
  }
}
