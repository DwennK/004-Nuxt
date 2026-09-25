import Papa from 'papaparse'

export const TAC_SOURCE = 'https://github.com/MoazEb/tac-database'
export const TAC_COMMIT_URL = 'https://api.github.com/repos/MoazEb/tac-database/commits?path=tac_full.csv&per_page=1'
export const TAC_CRON = '0 3 * * *'

export class TacError extends Error {}

function modelName(brand: string, specs: string) {
  const parts = specs.split(',').map(part => part.trim().replace(/\s+/g, ' '))
  const first = parts[0] || ''
  const candidate = first.toUpperCase() === brand.toUpperCase() ? parts[1] || '' : first
  if (candidate.length < 2 || candidate.length > 200 || (/[<>]/.test(candidate) || [...candidate].some(char => char.charCodeAt(0) < 32))
    || /^(N\/?A|UNKNOWN|UNSPECIFIED|NONE|NULL|NOT_COMMON|OLD_PHONES)$/i.test(candidate)
    || /TEST IMEI/i.test(specs) || candidate.toUpperCase() === brand.toUpperCase()) return null
  if (/^(APPLE )?IPHONE\b/i.test(candidate)) {
    return candidate.replace(/^(APPLE )?IPHONE\b/i, 'iPhone')
      .replace(/\b(PRO|MAX|MINI|PLUS|AIR)\b/gi, word => word[0]!.toUpperCase() + word.slice(1).toLowerCase())
  }
  return candidate
}

export function parseTacDataset(csv: string) {
  const entries = new Map<string, { brand: string, model: string }>()
  const conflicts = new Set<string>()
  let rows = 0
  let ignored = 0
  let headerChecked = false
  Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: header => header.replace(/^\uFEFF/, '').trim(),
    step(result) {
      if (!headerChecked) {
        if (result.meta.fields?.join(',') !== 'Brand,TAC,SPECS') throw new TacError('invalid_columns')
        headerChecked = true
      }
      if (result.errors.length) throw new TacError('invalid_csv')
      rows++
      const tac = (result.data.TAC || '').trim()
      const brand = (result.data.Brand || '').trim().toUpperCase()
      const model = modelName(brand, result.data.SPECS || '')
      if (!/^\d{8}$/.test(tac) || !brand || !model) {
        ignored++
        return
      }
      const previous = entries.get(tac)
      if (conflicts.has(tac)) return
      if (previous && (previous.brand !== brand || previous.model.toUpperCase() !== model.toUpperCase())) {
        entries.delete(tac)
        conflicts.add(tac)
      } else if (!previous) entries.set(tac, { brand, model })
    }
  })
  if (!headerChecked || !entries.size) throw new TacError('empty_dataset')
  const blocks = new Map<string, Record<string, string>>()
  for (const [tac, { model }] of entries) {
    const prefix = tac.slice(0, 3)
    if (!blocks.has(prefix)) blocks.set(prefix, Object.create(null))
    blocks.get(prefix)![tac] = model
  }
  const chunks = [...blocks].map(([prefix, models]) => ({ prefix, payload: JSON.stringify(models) }))
  if (chunks.some(chunk => new TextEncoder().encode(chunk.payload).length > 1024 * 1024)) throw new TacError('block_too_large')
  return { chunks, rows, entries: entries.size, ignored, conflicts: conflicts.size }
}
