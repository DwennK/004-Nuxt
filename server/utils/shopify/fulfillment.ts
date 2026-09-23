import { z } from 'zod'
import { graphql, type ShopifyConfig } from './client'
import { shopifyError } from './model'

export const fulfillmentQuery = `query PosOrderFulfillment($id: ID!) {
  order(id: $id) {
    id cancelledAt displayFulfillmentStatus
    fulfillments(first: 250) { id status }
    fulfillmentsCount { count precision }
    fulfillmentOrders(first: 100) {
      nodes { id status supportedActions { action } assignedLocation { location { id } } }
      pageInfo { hasNextPage }
    }
  }
}`
export const fulfillmentCreateMutation = `mutation PosFulfillmentCreate($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id status }
    userErrors { field message }
  }
}`
export const fulfillmentCancelMutation = `mutation PosFulfillmentCancel($id: ID!) {
  fulfillmentCancel(id: $id) {
    fulfillment { id status }
    userErrors { field message }
  }
}`

const fulfillmentSchema = z.object({ id: z.string().min(1), status: z.string() })
const orderSchema = z.object({
  id: z.string(), cancelledAt: z.string().nullable(), displayFulfillmentStatus: z.string(),
  fulfillments: z.array(fulfillmentSchema),
  fulfillmentsCount: z.object({ count: z.number().int(), precision: z.literal('EXACT') }),
  fulfillmentOrders: z.object({
    nodes: z.array(z.object({
      id: z.string(), status: z.string(), supportedActions: z.array(z.object({ action: z.string() })),
      assignedLocation: z.object({ location: z.object({ id: z.string() }).nullable() })
    })),
    pageInfo: z.object({ hasNextPage: z.boolean() })
  })
})
export type FulfillmentOrderState = z.infer<typeof orderSchema>
const activeFulfillments = (order: FulfillmentOrderState) => order.fulfillments.filter(item => !['CANCELLED', 'ERROR', 'FAILURE'].includes(item.status))
export function fulfillmentState(order: FulfillmentOrderState) {
  return {
    collected: order.displayFulfillmentStatus === 'FULFILLED',
    partial: order.displayFulfillmentStatus !== 'FULFILLED' && activeFulfillments(order).length > 0
  }
}

export async function fetchFulfillment(config: ShopifyConfig, id: string) {
  const result = await graphql<{ order: unknown }>(config, fulfillmentQuery, { id })
  if (!result.order) return shopifyError('Commande Shopify introuvable ou inaccessible.', 'SHOPIFY_NOT_FOUND', 404)
  const parsed = orderSchema.safeParse(result.order)
  if (!parsed.success || parsed.data.id !== id) return shopifyError('État de livraison Shopify incomplet.', 'SHOPIFY_INVALID_RESPONSE', 502)
  const order = parsed.data
  // Never mistake a truncated/partly accessible result for a complete order.
  if (order.fulfillmentOrders.pageInfo.hasNextPage || order.fulfillmentsCount.count !== order.fulfillments.length) {
    return shopifyError('Cette commande comporte trop de traitements. Gérez sa livraison dans Shopify.', 'SHOPIFY_FULFILLMENT_LIMIT', 409)
  }
  return order
}

function mutationResult(value: unknown, expectedStatus: string) {
  const parsed = z.object({
    fulfillment: fulfillmentSchema.nullable(), userErrors: z.array(z.object({ message: z.string() }))
  }).safeParse(value)
  if (!parsed.success) return shopifyError('Shopify n’a pas confirmé l’opération. Actualisez avant de réessayer.', 'SHOPIFY_INVALID_RESPONSE', 502)
  if (parsed.data.userErrors.length) return shopifyError(`Shopify : ${parsed.data.userErrors.map(error => error.message).join(' ').slice(0, 700)}`, 'SHOPIFY_FULFILLMENT_REFUSED', 409)
  if (parsed.data.fulfillment?.status !== expectedStatus) return shopifyError('Shopify n’a pas confirmé le changement de traitement.', 'SHOPIFY_FULFILLMENT_UNCONFIRMED', 409)
}

export async function setFulfillment(config: ShopifyConfig, id: string, collected: boolean) {
  const order = await fetchFulfillment(config, id)
  if (order.cancelledAt) return shopifyError('La commande Shopify est annulée.', 'SHOPIFY_ORDER_CANCELLED', 409)
  if (collected && fulfillmentState(order).collected) return order
  if (!collected && !activeFulfillments(order).length) {
    if (fulfillmentState(order).collected) return shopifyError('Aucun traitement annulable n’est accessible dans Shopify.', 'SHOPIFY_FULFILLMENT_BLOCKED', 409)
    return order
  }

  if (collected) {
    const pending = order.fulfillmentOrders.nodes.filter(item => !['CLOSED', 'CANCELLED'].includes(item.status))
    if (!pending.length || pending.some(item => !item.assignedLocation.location || !item.supportedActions.some(action => action.action === 'CREATE_FULFILLMENT'))) {
      return shopifyError('Shopify ne permet pas de traiter tous les articles. Vérifiez les blocages et les emplacements dans Shopify.', 'SHOPIFY_FULFILLMENT_BLOCKED', 409)
    }
    const groups = new Map<string, string[]>()
    for (const item of pending) {
      const location = item.assignedLocation.location!.id
      groups.set(location, [...(groups.get(location) || []), item.id])
    }
    if (groups.size > 10) return shopifyError('Trop d’emplacements. Gérez cette livraison dans Shopify.', 'SHOPIFY_FULFILLMENT_LIMIT', 409)
    for (const ids of groups.values()) {
      const result = await graphql<{ fulfillmentCreate: unknown }>(config, fulfillmentCreateMutation, {
        fulfillment: { notifyCustomer: false, lineItemsByFulfillmentOrder: ids.map(fulfillmentOrderId => ({ fulfillmentOrderId })) }
      })
      mutationResult(result.fulfillmentCreate, 'SUCCESS')
    }
  } else {
    const active = activeFulfillments(order)
    if (active.length > 10) return shopifyError('Trop de traitements. Annulez-les dans Shopify.', 'SHOPIFY_FULFILLMENT_LIMIT', 409)
    for (const item of active) {
      const result = await graphql<{ fulfillmentCancel: unknown }>(config, fulfillmentCancelMutation, { id: item.id })
      mutationResult(result.fulfillmentCancel, 'CANCELLED')
    }
  }
  const verified = await fetchFulfillment(config, id)
  const state = fulfillmentState(verified)
  if (collected ? !state.collected : state.collected || state.partial) {
    return shopifyError('Le traitement Shopify est encore partiel ou en cours. Actualisez puis réessayez.', 'SHOPIFY_FULFILLMENT_UNCONFIRMED', 409)
  }
  return verified
}
