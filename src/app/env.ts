import { z } from 'zod'

const environmentSchema = z.object({
    VITE_API_URL: z.string().default(import.meta.env.BASE_URL.replace(/\/$/, '')),
})

export const environment = environmentSchema.parse({
    VITE_API_URL: import.meta.env.VITE_API_URL || import.meta.env.BASE_URL.replace(/\/$/, ''),
})
