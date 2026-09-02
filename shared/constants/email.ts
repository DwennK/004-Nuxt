export const sentMailStatuses = ['sending', 'sent', 'delivered', 'delivery_delayed', 'bounced', 'rejected', 'failed', 'unknown'] as const

export const emailEventsQueue = 'pos-email-events'
export const emailSendingStaleMs = 2 * 60 * 1000
