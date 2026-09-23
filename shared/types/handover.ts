import type { ShopifyProvenance } from './shopify'

export interface HandoverState {
  collected: boolean
  partial: boolean
  pending: boolean
  shopify: ShopifyProvenance | null
}
