import { formatImei } from './pos'
import { foldSearchText } from './search'

// The legacy `imei` stock column also holds serial numbers for Wi-Fi devices.
export function normalizeSmartphoneIdentifier(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, '').toUpperCase()
}

export function formatSmartphoneIdentifier(value: string | null | undefined) {
  const identifier = normalizeSmartphoneIdentifier(value)
  return /^\d{15}$/.test(identifier) ? formatImei(identifier) : identifier
}

export function matchesSmartphoneStock(item: { model: string, imei: string | null }, search: string) {
  const identifierSearch = normalizeSmartphoneIdentifier(search)
  return foldSearchText(item.model).includes(foldSearchText(search))
    || (!!identifierSearch && normalizeSmartphoneIdentifier(item.imei).includes(identifierSearch))
}
