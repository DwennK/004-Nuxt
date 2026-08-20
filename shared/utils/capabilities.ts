export const operatorCapabilities = [
  'financial:read',
  'financial:record'
] as const

export const adminOnlyCapabilities = [
  'financial:adjust',
  'records:delete',
  'administration:manage'
] as const

export const authCapabilities = [
  ...operatorCapabilities,
  ...adminOnlyCapabilities
] as const

export type AuthCapability = (typeof authCapabilities)[number]

export type CapabilitySubject = {
  isAdmin: boolean
}

const operatorCapabilitySet = new Set<AuthCapability>(operatorCapabilities)

export function hasCapability(subject: CapabilitySubject, capability: AuthCapability) {
  return subject.isAdmin || operatorCapabilitySet.has(capability)
}

export function listCapabilities(subject: CapabilitySubject): AuthCapability[] {
  return authCapabilities.filter(capability => hasCapability(subject, capability))
}
