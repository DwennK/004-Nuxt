const vatInclusiveBaseSql = '(line_total / (1 + (vat_rate / 100.0)))'
const shiftedVatInclusiveBaseSql = `((${vatInclusiveBaseSql}) + 0.5)`

// SQLite CAST truncates toward zero. Subtracting one for negative fractional
// values turns it into FLOOR(x + 0.5), which matches Math.round(x) at negative
// half values while avoiding a dependency on optional SQLite math functions.
export const documentLineTaxableBaseSql = `CASE
  WHEN vat_rate > 0 THEN (
    CAST(${shiftedVatInclusiveBaseSql} AS INTEGER)
    - CASE
        WHEN ${shiftedVatInclusiveBaseSql} < CAST(${shiftedVatInclusiveBaseSql} AS INTEGER) THEN 1
        ELSE 0
      END
  )
  ELSE line_total
END`
