import { beforeEach, describe, expect, it, vi } from 'vitest'
import { externalFetch } from '../../server/utils/external-fetch'
import { listMobileSentrixCategories, listMobileSentrixProducts, searchMobileSentrixProducts } from '../../server/utils/mobilesentrix'

vi.mock('../../server/utils/external-fetch', () => ({ externalFetch: vi.fn() }))

function mockResponse(payload: unknown) {
  vi.mocked(externalFetch).mockResolvedValue({
    response: new Response(JSON.stringify(payload)),
    requestId: 'mobilesentrix-images-test'
  })
}

describe('MobileSentrix image URLs', () => {
  beforeEach(() => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      mobilesentrixBaseUrl: 'https://www.mobilesentrix.com',
      mobilesentrixConsumerName: 'test',
      mobilesentrixConsumerKey: 'test-consumer-key',
      mobilesentrixConsumerSecret: 'test-consumer-secret',
      mobilesentrixAccessToken: 'test-access-token',
      mobilesentrixAccessTokenSecret: 'test-access-token-secret'
    }))
  })

  it('keeps CDN images in search results without allowing CDN product links', async () => {
    const imageUrl = 'https://static.mobilesentrix.com/catalog/product/small_image/screen.webp'
    mockResponse({ data: { total_items: 1, items: [{ title: 'iPhone screen', image_link: imageUrl, link: imageUrl }] } })

    const result = await searchMobileSentrixProducts({ q: 'iphone lcd', maxResults: 20, startIndex: 0 })

    expect(result.items[0]).toMatchObject({ name: 'iPhone screen', imageUrl, url: null })
  })

  it('supports CDN category images and existing relative URLs', async () => {
    const cdnImage = 'https://static.mobilesentrix.com/catalog/category/parts.webp'
    mockResponse([
      { name: 'Parts', image: cdnImage, link: '/replacement-parts' },
      { name: 'Tools', image: '/media/tools.webp', link: '/tools' }
    ])

    const result = await listMobileSentrixCategories()

    expect(result.items).toMatchObject([
      { imageUrl: cdnImage, url: 'https://www.mobilesentrix.com/replacement-parts' },
      { imageUrl: 'https://www.mobilesentrix.com/media/tools.webp', url: 'https://www.mobilesentrix.com/tools' }
    ])
  })

  it('maps a single Europe product detail as one product, not its attribute values', async () => {
    const config = useRuntimeConfig()
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, mobilesentrixBaseUrl: 'https://www.mobilesentrix.eu' }))
    mockResponse({ entity_id: 10, sku: '000123', name: 'Battery', url: 'https://www.mobilesentrix.eu/battery', image_url: 'https://static.mobilesentrix.eu/battery.webp' })
    const result = await listMobileSentrixProducts({ productId: '10', sku: null, categoryId: null, deviceProducts: false, page: 1, limit: 20 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ id: '10', sku: '000123', url: 'https://www.mobilesentrix.eu/battery', imageUrl: 'https://static.mobilesentrix.eu/battery.webp' })
  })

  it('flattens nested categories while preserving parent links and removing duplicates', async () => {
    mockResponse({ data: [{ id: '1', name: 'Parts', children: [{ id: '2', name: 'Apple', children_data: [{ id: '3', name: 'iPhone' }] }] }, { id: '2', name: 'Duplicate' }] })
    const result = await listMobileSentrixCategories()
    expect(result.items.map(({ id, parentId }) => ({ id, parentId }))).toEqual([
      { id: '1', parentId: null }, { id: '2', parentId: '1' }, { id: '3', parentId: '2' }
    ])
  })

  it.each([
    'http://static.mobilesentrix.com/image.webp',
    'https://static.mobilesentrix.com.evil.test/image.webp',
    'https://static.mobilesentrix.com@evil.test/image.webp',
    'https://other.mobilesentrix.com/image.webp',
    'javascript:alert(1)',
    'data:image/svg+xml,<svg></svg>'
  ])('rejects an unapproved image URL: %s', async (imageUrl) => {
    mockResponse({ data: { items: [{ image_link: imageUrl }] } })

    const result = await searchMobileSentrixProducts({ q: 'iphone lcd', maxResults: 20, startIndex: 0 })

    expect(result.items[0]?.imageUrl).toBeNull()
  })
})
