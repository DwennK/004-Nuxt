import { beforeEach, describe, expect, it, vi } from 'vitest'
import { externalFetch } from '../../server/utils/external-fetch'
import { listMobileSentrixCategories, searchMobileSentrixProducts } from '../../server/utils/mobilesentrix'

vi.mock('../../server/utils/external-fetch', () => ({ externalFetch: vi.fn() }))
vi.mock('../../server/utils/pos/core', async () => import('../../shared/lib/text'))

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
