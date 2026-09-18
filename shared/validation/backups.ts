import { z } from 'zod'

export const backupSettingsInputSchema = z.object({ dailyEnabled: z.boolean() }).strict()
