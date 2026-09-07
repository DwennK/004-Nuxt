import { dossierSessionSchema } from '~~/shared/validation/dossier'
import { getUseCaseContext } from '~~/server/utils/auth/session'
import { dossierSession } from '~~/server/utils/pos/dossiers'

export default eventHandler(async (event) => {
  const input = await readValidatedBody(event, dossierSessionSchema.parse)
  return dossierSession(input, getUseCaseContext(event).actor)
})
