// Operator-only client. Credentials never appear in reports or errors.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const supplierOrigin = 'https://www.mobilesentrix.com'

export function europeanProductFromHtml(html, sku) {
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const visit = (value) => {
        if (!value || typeof value !== 'object') return false
        if ((value['@type'] === 'Product' || value['@type']?.includes?.('Product')) && String(value.sku) === String(sku)) return true
        return Object.values(value).some(child => Array.isArray(child) ? child.some(visit) : visit(child))
      }
      if (visit(JSON.parse(script[1]))) return true
    } catch { /* Invalid structured data is not proof. */ }
  }
  return false
}

const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)

export function createSupplierApi(env = process.env, fetcher = fetch, options = {}) {
  const read = name => env[`NUXT_${name}`] || env[name]
  const key = read('MOBILESENTRIX_CONSUMER_KEY')
  const secret = read('MOBILESENTRIX_CONSUMER_SECRET')
  const token = read('MOBILESENTRIX_ACCESS_TOKEN')
  const tokenSecret = read('MOBILESENTRIX_ACCESS_TOKEN_SECRET')
  if (![key, secret, token, tokenSecret].every(Boolean)) throw new Error('Identifiants OAuth MobileSentrix manquants')
  const headerName = read('MOBILESENTRIX_REST_AUTH_HEADER_NAME')
  const headerValue = read('MOBILESENTRIX_REST_AUTH_HEADER_VALUE')
  if (Boolean(headerName) !== Boolean(headerValue) || headerName?.toLowerCase() === 'authorization') throw new Error('Header REST MobileSentrix invalide')

  async function get(path, query = {}) {
    const url = new URL(`/api/rest/${path}`, supplierOrigin)
    url.search = new URLSearchParams(query).toString()
    const cachePath = options.cacheDir ? join(options.cacheDir, `${createHash('sha256').update(url.href).digest('hex')}.json`) : null
    if (cachePath && !options.fresh) {
      try {
        const cached = JSON.parse(await readFile(cachePath, 'utf8'))
        if (cached.url === url.href && Date.now() - cached.at < 3_600_000) return cached.payload
      } catch { /* A missing/invalid cache always requires a real request. */ }
    }
    const params = {
      oauth_consumer_key: key, oauth_token: token, oauth_signature_method: 'PLAINTEXT',
      oauth_signature: `${encode(secret)}&${encode(tokenSecret)}`,
      oauth_timestamp: String(Math.floor(Date.now() / 1000)),
      oauth_nonce: crypto.randomUUID().replaceAll('-', ''), oauth_version: '1.0'
    }
    let response
    try {
      response = await fetcher(url, {
        redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: 'application/json',
          Authorization: `OAuth ${Object.entries(params).map(([k, v]) => `${encode(k)}="${encode(v)}"`).join(', ')}`,
          ...(headerName ? { [headerName]: headerValue } : {})
        }
      })
    } catch {
      throw new Error('API MobileSentrix inaccessible (réseau, délai ou redirection)')
    }
    if (!response.ok) throw new Error(`API MobileSentrix HTTP ${response.status}${response.status === 401 ? ' : identifiants OAuth refusés' : ''}`)
    try {
      const payload = await response.json()
      if (cachePath) {
        await mkdir(options.cacheDir, { recursive: true, mode: 0o700 })
        await writeFile(cachePath, JSON.stringify({ url: url.href, at: Date.now(), payload }), { mode: 0o600 })
      }
      return payload
    } catch {
      throw new Error('Réponse API MobileSentrix non JSON')
    }
  }

  return {
    async europeProduct(product) {
      const url = new URL(product.url)
      if (url.origin !== supplierOrigin) throw new Error('Origine fournisseur invalide')
      url.hostname = 'www.mobilesentrix.eu'
      try {
        // Public page only: never send the American API credentials to Europe.
        const response = await fetcher(url, { signal: AbortSignal.timeout(20_000) })
        if (!response.ok || new URL(response.url).origin !== 'https://www.mobilesentrix.eu') return { status: 'unverified' }
        const confirmed = europeanProductFromHtml(await response.text(), product.sku)
        return confirmed ? { status: 'verified', url: response.url } : { status: 'unverified' }
      } catch { return { status: 'unverified' } }
    },
    async search(q) {
      const products = new Map()
      let total = null
      for (let start = 0; start < 10_000;) {
        const payload = await get('searchproduct', { q, max_results: '100', start_index: String(start) })
        const data = payload?.data
        const count = Number(data?.total_items)
        if (!Array.isArray(data?.items) || !Number.isInteger(count) || count < 0) throw new Error('Recherche MobileSentrix incomplète : réponse invalide')
        if (total !== null && total !== count) throw new Error('Recherche MobileSentrix modifiée pendant la pagination ; relancer')
        total = count
        const before = products.size
        for (const item of data.items) {
          const id = String(item.product_id || '')
          if (!/^\d+$/.test(id)) throw new Error('Résultat fournisseur sans identifiant produit')
          products.set(id, item)
        }
        if (products.size >= total) return [...products.values()]
        if (!data.items.length || products.size === before) throw new Error('Recherche MobileSentrix incomplète : pagination interrompue')
        start += data.items.length
      }
      throw new Error('Recherche MobileSentrix incomplète : limite de pagination atteinte')
    },
    async product(id) {
      if (!/^\d+$/.test(String(id))) throw new Error('Identifiant produit invalide')
      const payload = await get(`products/${id}`)
      const product = payload?.data || payload
      if (String(product?.entity_id) !== String(id) || !product?.sku || !product?.name) throw new Error('Fiche fournisseur incomplète ou identifiant incohérent')
      let url
      try {
        url = new URL(product.url)
      } catch {
        throw new Error('Fiche fournisseur sans URL valide')
      }
      if (url.origin !== supplierOrigin || url.username || url.password) throw new Error('La fiche ne provient pas de la boutique API configurée')
      return product
    }
  }
}
