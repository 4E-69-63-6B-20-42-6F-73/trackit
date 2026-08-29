import { z } from 'zod'
import { dateKeyInTimezone } from './timezone.js'

const explicitDateRangeSchema = z
    .object({
        from: z.string().date().optional(),
        to: z.string().date().optional(),
    })
    .refine(value => !value.from || !value.to || value.from <= value.to, {
        message: 'from must be on or before to',
        path: ['from'],
    })

export const maintenanceDateRangeSchema = z.union([
    z.object({ lastDays: z.number().int().min(1).max(3650) }),
    explicitDateRangeSchema,
])

export type MaintenanceDateRange = z.infer<typeof maintenanceDateRangeSchema>
export type ResolvedMaintenanceDateRange = { from?: string; to?: string }

const shiftDate = (date: string, days: number) => {
    const value = new Date(`${date}T00:00:00.000Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
}

export function resolveMaintenanceDateRange(
    range: MaintenanceDateRange,
    timezone: string,
    now = new Date(),
): ResolvedMaintenanceDateRange {
    if ('lastDays' in range) {
        const to = dateKeyInTimezone(now, timezone)
        return { from: shiftDate(to, -(range.lastDays - 1)), to }
    }
    return range
}
