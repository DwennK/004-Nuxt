import { listUsers } from '~~/server/utils/users'

export default eventHandler(async () => {
  return listUsers()
})
