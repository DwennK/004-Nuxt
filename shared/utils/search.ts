/** Fold accents and case for comparisons without changing the displayed text. */
export function foldSearchText(value: string | null | undefined) {
  return (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function matchesCustomerSearch(customer: {
  name: string
  companyName?: string | null
  phone: string
  email: string
}, query: string) {
  const search = foldSearchText(query).trim()
  const name = foldSearchText(customer.name)
  return search.split(/\s+/).every(word => name.includes(word))
    || [customer.companyName, customer.phone, customer.email].some(value => foldSearchText(value).includes(search))
}
