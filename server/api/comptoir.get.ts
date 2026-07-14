import { listDocuments } from '~~/server/utils/pos/documents'
import { getReportsOverview } from '~~/server/utils/pos/reports'
import { listTickets } from '~~/server/utils/pos/tickets'
import type { CounterOverviewResponse } from '~~/shared/types/pos'
import { toDateInputValue } from '~~/shared/utils/pos'

export default eventHandler(async (): Promise<CounterOverviewResponse> => {
  const [
    readyTickets,
    dueDocuments,
    diagnosisTickets,
    approvalTickets,
    waitingPartsTickets,
    reportsOverview
  ] = await Promise.all([
    listTickets({ status: 'ready_for_pickup', pageSize: 6 }),
    listDocuments({ paymentState: 'due', sortBy: 'balanceDue', pageSize: 6 }),
    listTickets({ status: 'diagnosis', pageSize: 4 }),
    listTickets({ status: 'awaiting_customer_approval', pageSize: 4 }),
    listTickets({ status: 'waiting_parts', pageSize: 4 }),
    getReportsOverview(toDateInputValue())
  ])

  return {
    readyTickets,
    dueDocuments,
    diagnosisTickets,
    approvalTickets,
    waitingPartsTickets,
    reportsOverview
  }
})
