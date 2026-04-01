export interface PostalCodeLookupQuery {
  postalCode: string
}

export interface PostalCodeLookupResult {
  postalCode: string
  localities: string[]
}
