import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  adminOnlyCapabilities,
  authCapabilities,
  hasCapability,
  listCapabilities,
  operatorCapabilities
} from '../../shared/utils/capabilities.ts'

const operator = { isAdmin: false }
const admin = { isAdmin: true }

test('operators retain the POS financial baseline without admin capabilities', () => {
  assert.deepEqual(listCapabilities(operator), [...operatorCapabilities])

  for (const capability of operatorCapabilities) {
    assert.equal(hasCapability(operator, capability), true)
  }

  for (const capability of adminOnlyCapabilities) {
    assert.equal(hasCapability(operator, capability), false)
  }
})

test('admins receive every declared capability', () => {
  assert.deepEqual(listCapabilities(admin), [...authCapabilities])

  for (const capability of authCapabilities) {
    assert.equal(hasCapability(admin, capability), true)
  }
})

const routePolicies = {
  'financial:read': [
    'server/api/comptoir.get.ts',
    'server/api/home.get.ts',
    'server/api/documents/index.get.ts',
    'server/api/documents/[id].get.ts',
    'server/api/payments/index.get.ts',
    'server/api/payments/[id].get.ts',
    'server/api/reports/end-of-day.get.ts',
    'server/api/reports/leaders.get.ts',
    'server/api/reports/overview.get.ts'
  ],
  'financial:record': [
    'server/api/documents/index.post.ts',
    'server/api/documents/[id]/email.post.ts',
    'server/api/documents/[id]/mark-paid.post.ts',
    'server/api/payments/index.post.ts',
    'server/api/sales/create-and-pay.post.ts',
    'server/api/tickets/[id]/invoice.post.ts',
    'server/api/tickets/[id]/order.post.ts',
    'server/api/tickets/[id]/quote.post.ts'
  ],
  'financial:adjust': [
    'server/api/documents/[id].patch.ts',
    'server/api/documents/[id].delete.ts',
    'server/api/payments/[id].delete.ts',
    'server/api/payments/[id].patch.ts'
  ],
  'records:delete': [
    'server/api/catalog-items/[id].delete.ts',
    'server/api/customers/[id].delete.ts',
    'server/api/documents/[id].delete.ts',
    'server/api/employees/[id].delete.ts',
    'server/api/payments/[id].delete.ts',
    'server/api/smartphone-reservations/bulk-delete.post.ts',
    'server/api/smartphone-stocks/bulk-delete.post.ts',
    'server/api/tickets/[id].delete.ts',
    'server/api/vacations/[id].delete.ts'
  ]
}

test('sensitive API routes keep their explicit capability guards', () => {
  for (const [capability, paths] of Object.entries(routePolicies)) {
    for (const path of paths) {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
      assert.match(
        source,
        new RegExp(`requireCapability\\(event, ['"]${capability}['"]\\)`),
        `${path} must require ${capability}`
      )
    }
  }
})

const guardedUiPolicies = {
  'records:delete': [
    'app/pages/catalog/index.vue',
    'app/pages/customers/index.vue',
    'app/pages/payments/index.vue',
    'app/pages/tickets/index.vue',
    'app/pages/vacances.vue',
    'app/pages/stocks-smartphone.vue',
    'app/pages/reservations-smartphone.vue',
    'app/components/pos/DocumentPaymentsEditor.vue',
    'app/components/smartphones/DeleteModal.vue',
    'app/components/reservations/DeleteModal.vue'
  ],
  'financial:adjust': [
    'app/pages/documents/[id]/index.vue',
    'app/pages/payments/index.vue',
    'app/components/pos/DocumentPaymentsEditor.vue'
  ],
  'administration:manage': [
    'app/pages/settings/users.vue'
  ]
}

test('admin-only UI actions consume the session capability contract', () => {
  for (const [capability, paths] of Object.entries(guardedUiPolicies)) {
    for (const path of paths) {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
      assert.match(source, /useCapabilities\(\)/, `${path} must consume session capabilities`)
      assert.match(
        source,
        new RegExp(`can\\(['"]${capability}['"]\\)`),
        `${path} must gate ${capability}`
      )
    }
  }
})

test('the public session shape exposes capability names without request actor data', () => {
  const authTypes = readFileSync(new URL('../../auth.d.ts', import.meta.url), 'utf8')
  const sessionPlugin = readFileSync(new URL('../../server/plugins/session.ts', import.meta.url), 'utf8')

  assert.match(authTypes, /capabilities:\s*AuthCapability\[\]/)
  assert.doesNotMatch(authTypes, /actor|requestId/)
  assert.match(sessionPlugin, /session\.user\s*=\s*user/)
})
