import { listUsers } from '~~/server/utils/users'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  return listUsers()
})
