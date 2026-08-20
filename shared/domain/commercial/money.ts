export type CommercialLineAmounts = {
  quantity: number
  unitPrice: number
  vatRate: number
}

export type CalculatedCommercialLine<TLine extends CommercialLineAmounts> = TLine & {
  lineTotal: number
  subtotal: number
  taxAmount: number
}

export type CommercialTotals<TLine extends CommercialLineAmounts> = {
  lines: Array<CalculatedCommercialLine<TLine>>
  subtotal: number
  taxAmount: number
  total: number
}

/**
 * Calculates VAT already included in an integer-cent TTC amount.
 *
 * Negative adjustments deliberately produce negative VAT so the document
 * remains arithmetically balanced. Validation of quantities and allowed final
 * totals belongs to the use case accepting the commercial lines.
 */
export function calculateIncludedVatAmount(totalWithVat: number, vatRate: number) {
  if (vatRate <= 0) {
    return 0
  }

  const taxableBase = Math.round(totalWithVat / (1 + (vatRate / 100)))

  return totalWithVat - taxableBase
}

export function calculateCommercialTotals<TLine extends CommercialLineAmounts>(
  lines: readonly TLine[]
): CommercialTotals<TLine> {
  const normalizedLines = lines.map((line): CalculatedCommercialLine<TLine> => {
    const lineTotal = Math.round(line.quantity * line.unitPrice)
    const taxAmount = calculateIncludedVatAmount(lineTotal, line.vatRate)

    return {
      ...line,
      lineTotal,
      subtotal: lineTotal - taxAmount,
      taxAmount
    }
  })

  return normalizedLines.reduce<CommercialTotals<TLine>>((totals, line) => {
    totals.lines.push(line)
    totals.subtotal += line.subtotal
    totals.taxAmount += line.taxAmount
    totals.total += line.lineTotal

    return totals
  }, {
    lines: [],
    subtotal: 0,
    taxAmount: 0,
    total: 0
  })
}
