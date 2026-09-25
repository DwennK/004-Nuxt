export interface TicketPrintCode {
  label: string
  value: string
  patternPoints: number[]
}

export interface TicketIntakePrintModel {
  title: string
  deviceLabel: string | null
  description: string | null
  codes: TicketPrintCode[]
}
