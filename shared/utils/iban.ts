function normalizeIbanInput(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, '').toUpperCase().trim()
}

function ibanModulo97(iban: string) {
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
  const expanded = rearranged.replace(/[A-Z]/g, char => String(char.charCodeAt(0) - 55))

  let remainder = 0

  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97
  }

  return remainder
}

export function isValidIban(value: string | null | undefined) {
  const iban = normalizeIbanInput(value)

  if (!iban) {
    return false
  }

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    return false
  }

  return ibanModulo97(iban) === 1
}

export function isValidSwissQrBillAccount(value: string | null | undefined) {
  const iban = normalizeIbanInput(value)

  if (!isValidIban(iban)) {
    return false
  }

  return iban.startsWith('CH') || iban.startsWith('LI')
}

export function normalizeIban(value: string | null | undefined) {
  return normalizeIbanInput(value)
}
