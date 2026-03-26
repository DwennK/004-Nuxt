export interface CompanySettingsRecord {
  id: number
  name: string
  address: string | null
  postalCode: string | null
  city: string | null
  countryCode: string | null
  phone: string | null
  email: string | null
  website: string | null
  vatNumber: string | null
  bankName: string | null
  iban: string | null
  paymentTerms: string | null
  footerNotes: string | null
  logoDataUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface CompanySettingsInput {
  name: string
  address: string | null
  postalCode: string | null
  city: string | null
  countryCode: string | null
  phone: string | null
  email: string | null
  website: string | null
  vatNumber: string | null
  bankName: string | null
  iban: string | null
  paymentTerms: string | null
  footerNotes: string | null
  logoDataUrl: string | null
}
