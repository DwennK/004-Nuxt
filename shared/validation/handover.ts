import { z } from 'zod'

export const handoverInputSchema = z.object({ collected: z.boolean() }).strict()
