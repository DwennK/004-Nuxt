#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createDatabaseClient, parseCliArgs, resolveDatabaseTarget, runCli } from '../db/_shared.mjs'
import { createSupplierApi, supplierOrigin } from './api.mjs'
import { matchRepair, partMatches, qualityRank, requiredModels, rulesVersion } from './match.mjs'

const fields = ['id', 'name', 'sku', 'type', 'category', 'brand', 'model', 'service_kind', 'keywords_json', 'default_price', 'vat_rate', 'is_active', 'created_at', 'updated_at', 'mobilesentrix_json']
export const fingerprint = row => createHash('sha256').update(JSON.stringify(fields.map(key => row[key] ?? null))).digest('hex')
const association = row => row.mobilesentrix_json ? JSON.parse(row.mobilesentrix_json) : null
const sameAssociation = (a, b) => a && b && ['status', 'sku', 'productId', 'url', 'note', 'source'].every(key => a[key] === b[key])
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')

export async function buildReport(rows, api, target, onProgress = () => {}) {
  const searches = new Map()
  const details = new Map()
  let unavailable = null
  const entries = []
  for (const repair of rows.filter(row => row.type === 'repair')) {
    onProgress({ processed: entries.length, total: rows.filter(row => row.type === 'repair').length, name: repair.name })
    const base = { id: repair.id, name: repair.name, beforeHash: fingerprint(repair), before: repair }
    if (association(repair)?.source === 'manual') {
      entries.push({ ...base, status: 'preserved', note: 'Choix manuel conservé', candidates: [] })
      continue
    }
    try {
      if (unavailable) throw new Error(unavailable)
      if (!repair.model || !['Apple', 'Samsung'].includes(repair.brand)) throw new Error('Modèle ou marque non pris en charge')
      // One exhaustive search per model; never interpret a short page as the end.
      const summaries = new Map()
      for (const model of requiredModels(repair)) {
        if (!searches.has(model)) searches.set(model, await api.search(model))
        for (const item of searches.get(model)) summaries.set(String(item.product_id), item)
      }
      const found = [...summaries.values()].filter(p => partMatches(repair, p) && qualityRank(repair, p) !== null)
      const products = []
      for (let index = 0; index < found.length; index += 3) {
        const batch = await Promise.all(found.slice(index, index + 3).map(async (summary) => {
          const id = String(summary.product_id)
          if (!details.has(id)) details.set(id, await api.product(id))
          const product = details.get(id)
          if (summary.product_code && String(summary.product_code) !== String(product.sku)) throw new Error('SKU de recherche différent de la fiche détaillée')
          return product
        }))
        products.push(...batch)
      }
      const result = matchRepair(repair, products)
      if (result.reference && api.europeProduct) {
        const europe = await api.europeProduct(result.reference)
        result.europe = europe
        result.note += europe.status === 'verified'
          ? ' ; même SKU vérifié sur .eu, stock non vérifié'
          : ' ; fiche API .com, présence sur .eu non confirmée'
        if (europe.status === 'verified') {
          // Product IDs are store-specific. Do not attach the .com ID to an EU URL.
          result.reference = { ...result.reference, url: europe.url, productId: null }
        }
      }
      entries.push({ ...base, ...result })
    } catch (error) {
      const note = error instanceof Error ? error.message : 'Recherche MobileSentrix bloquée'
      if (/HTTP (401|403|429)/.test(note)) unavailable = note
      entries.push({ ...base, status: 'blocked', note, candidates: [] })
    }
  }
  return {
    version: 1, rulesVersion, generatedAt: new Date().toISOString(), origin: supplierOrigin,
    target, summary: Object.fromEntries(['matched', 'variant_required', 'not_found', 'blocked', 'preserved'].map(status => [status, entries.filter(e => e.status === status).length])),
    entries
  }
}

export function proposedAssociation(entry, generatedAt) {
  return {
    status: entry.status,
    sku: entry.reference?.sku || null,
    productId: entry.reference?.productId || null,
    url: entry.reference?.url || null,
    note: entry.note.slice(0, 500), source: 'api', verifiedAt: generatedAt
  }
}

export async function applyReport(client, report, verifiedReport) {
  if (report.version !== 1 || report.rulesVersion !== rulesVersion || report.origin !== supplierOrigin) throw new Error('Version ou origine du rapport invalide')
  const entries = report.entries.filter(e => ['matched', 'variant_required', 'not_found'].includes(e.status))
  if (new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('Réparations dupliquées dans le rapport')
  const verified = new Map(verifiedReport.entries.map(e => [e.id, e]))
  const tx = await client.transaction('write')
  let changed = 0
  let unchanged = 0
  try {
    for (const entry of entries) {
      const current = (await tx.execute({ sql: 'SELECT * FROM catalog_items WHERE id = ?', args: [entry.id] })).rows[0]
      if (!current) throw new Error(`Réparation ${entry.id} supprimée depuis la simulation`)
      const expected = proposedAssociation(entry, report.generatedAt)
      if (sameAssociation(association(current), expected)) {
        unchanged++
        continue
      }
      if (fingerprint(current) !== entry.beforeHash || association(current)?.source === 'manual') throw new Error(`Réparation ${entry.id} modifiée depuis la simulation ; aucune écriture conservée`)
      const fresh = verified.get(entry.id)
      if (!fresh || fresh.status !== entry.status || JSON.stringify(fresh.reference) !== JSON.stringify(entry.reference)) throw new Error(`Correspondance ${entry.id} non confirmée par la nouvelle lecture fournisseur`)
      await tx.execute({
        sql: 'UPDATE catalog_items SET mobilesentrix_json = ?, updated_at = ? WHERE id = ?',
        args: [JSON.stringify(expected), new Date().toISOString(), entry.id]
      })
      changed++
    }
    await tx.commit()
  } catch (error) {
    await tx.rollback()
    throw error
  } finally { tx.close() }
  for (const entry of entries) {
    const row = (await client.execute({ sql: 'SELECT mobilesentrix_json FROM catalog_items WHERE id = ?', args: [entry.id] })).rows[0]
    if (!row || !sameAssociation(association(row), proposedAssociation(entry, report.generatedAt))) throw new Error(`Échec de relecture après application : ${entry.id}`)
  }
  return { changed, unchanged }
}

async function savePrivate(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, content, { mode: 0o600, flag: 'wx' })
}

async function main() {
  const { options, positional } = parseCliArgs(process.argv.slice(2), {
    booleanFlags: ['--apply', '--fresh', '--allow-production-read', '--allow-production-write', '--help'],
    valueFlags: ['--report', '--output', '--cache-dir', '--url', '--environment', '--confirm-target']
  })
  if (options.help) {
    console.log('Usage: node scripts/mobilesentrix/catalog.mjs [--output path.json] [--apply --report path.json]\nTarget options: --url --environment --confirm-target --allow-production-read --allow-production-write\nDefault: simulation only. Application rereads the supplier, backs up the catalogue and checks concurrent changes.')
    return
  }
  if (positional.length || (options.apply && !options.report)) throw new Error('Utilisez --apply --report chemin.json pour appliquer une simulation')
  const target = resolveDatabaseTarget(options, { access: options.apply ? 'write' : 'read' })
  const client = createDatabaseClient(target)
  const targetInfo = { id: target.targetId, environment: target.environment }
  try {
    const rows = (await client.execute('SELECT * FROM catalog_items ORDER BY id')).rows
    let api
    try {
      api = createSupplierApi(process.env, fetch, { cacheDir: options.cacheDir, fresh: options.apply || options.fresh })
    } catch {
      api = { search: async () => {
        throw new Error('Identifiants OAuth MobileSentrix manquants ou invalides')
      } }
    }
    if (options.apply) {
      const report = JSON.parse(await readFile(resolve(options.report), 'utf8'))
      if (JSON.stringify(report.target) !== JSON.stringify(targetInfo)) throw new Error('Le rapport vise une autre base de données')
      const columns = (await client.execute('PRAGMA table_info(catalog_items)')).rows
      if (!columns.some(column => column.name === 'mobilesentrix_json')) throw new Error('Appliquer la migration catalogue avant les correspondances')
      const applicable = report.entries.filter(entry => ['matched', 'variant_required', 'not_found'].includes(entry.status))
      const currentById = new Map(rows.map(row => [row.id, row]))
      const alreadyApplied = applicable.every(entry => currentById.has(entry.id)
        && sameAssociation(association(currentById.get(entry.id)), proposedAssociation(entry, report.generatedAt)))
      const fresh = alreadyApplied ? report : await buildReport(rows, api, targetInfo, progress => console.error(JSON.stringify(progress)))
      const backup = resolve(`.data/mobilesentrix/catalog-before-${stamp()}.json`)
      await savePrivate(backup, JSON.stringify({ target: targetInfo, rows }, null, 2))
      const result = await applyReport(client, report, fresh)
      console.log(JSON.stringify({ ...result, backup, blocked: report.summary.blocked, target: targetInfo }))
    } else {
      const report = await buildReport(rows, api, targetInfo, progress => console.error(JSON.stringify(progress)))
      const output = resolve(options.output || `.data/mobilesentrix/report-${stamp()}.json`)
      await savePrivate(output, JSON.stringify(report, null, 2))
      const escape = value => String(value || '').replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')
      const markdown = `# Correspondances MobileSentrix — modèles européens\n\n${report.generatedAt}\n\n${JSON.stringify(report.summary)}\n\n| Réparation | État | SKU proposé | Motif / candidats |\n|---|---|---|---|\n${report.entries.map(e => `| ${escape(e.name)} | ${e.status} | ${e.reference ? `[${escape(e.reference.sku)}](${e.reference.url})` : '—'} | ${escape(e.note)} ${e.candidates.map(c => `[${escape(c.name)} · ${escape(c.sku)}](${c.url})`).join(' ; ')} |`).join('\n')}\n`
      await savePrivate(`${output}.md`, markdown)
      console.log(JSON.stringify({ mode: 'simulation', summary: report.summary, output, target: targetInfo }))
    }
  } finally { client.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runCli(main)
