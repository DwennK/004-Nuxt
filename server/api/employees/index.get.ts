import { listEmployees } from '~~/server/utils/pos/vacations'

export default eventHandler(async () => {
  return listEmployees()
})
