import type { ShopifyProvenance } from './shopify'

export interface HandoverState {
  collected: boolean
  partial: boolean
  pending: boolean
  localOnly: boolean
  shopify: ShopifyProvenance | null
}
