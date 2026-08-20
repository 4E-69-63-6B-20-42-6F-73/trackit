import { z } from 'zod'

const environmentSchema = z.object({
    VITE_API_URL: z.string().url().or(z.literal('')).default(''),
})

export const environment = environmentSchema.parse({
    VITE_API_URL: import.meta.env.VITE_API_URL,
})
