import { listMobileSentrixCategories } from '~~/server/utils/mobilesentrix'

export default eventHandler(() => {
  return listMobileSentrixCategories()
})
