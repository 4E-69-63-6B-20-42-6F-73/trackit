import { z } from 'zod'

export const maintenanceDateRangeSchema = z
    .object({
        from: z.string().date().optional(),
        to: z.string().date().optional(),
    })
    .refine(value => !value.from || !value.to || value.from <= value.to, {
        message: 'from must be on or before to',
        path: ['from'],
    })

export type MaintenanceDateRange = z.infer<typeof maintenanceDateRangeSchema>
