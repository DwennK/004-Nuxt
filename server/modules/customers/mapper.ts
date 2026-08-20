import type { customers } from '~~/server/db/schema'
import type { CustomerRecord } from '~~/shared/types/pos'
import { formatCustomerName } from '~~/shared/utils/pos'

export function mapCustomer(row: typeof customers.$inferSelect): CustomerRecord {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    companyName: row.companyName,
    phone: row.phone,
    email: row.email,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    postalCode: row.postalCode,
    city: row.city,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    displayName: formatCustomerName(row)
  }
}
