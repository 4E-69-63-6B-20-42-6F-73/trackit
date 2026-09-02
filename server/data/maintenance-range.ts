import { addCalendarDays, calendarDateKey } from '@trackit/domain/calendar'
import { z } from 'zod'

const recordTypesSchema = z.array(z.string().trim().min(1)).min(1).max(64).optional()

const explicitDateRangeSchema = z
    .object({
        from: z.string().date().optional(),
        to: z.string().date().optional(),
    })
    .refine(value => !value.from || !value.to || value.from <= value.to, {
        message: 'from must be on or before to',
        path: ['from'],
    })

const explicitProviderRecordRangeSchema = z
    .object({
        from: z.string().date().optional(),
        to: z.string().date().optional(),
        recordTypes: recordTypesSchema,
    })
    .refine(value => !value.from || !value.to || value.from <= value.to, {
        message: 'from must be on or before to',
        path: ['from'],
    })

export const maintenanceDateRangeSchema = z.union([
    z.object({ lastDays: z.number().int().min(1).max(3650) }),
    explicitDateRangeSchema,
])

export const providerRecordMaintenanceSchema = z.union([
    z.object({
        lastDays: z.number().int().min(1).max(3650),
        recordTypes: recordTypesSchema,
    }),
    explicitProviderRecordRangeSchema,
])

export type MaintenanceDateRange = z.infer<typeof maintenanceDateRangeSchema>
export type ProviderRecordMaintenanceRange = z.infer<typeof providerRecordMaintenanceSchema>
export type ResolvedMaintenanceDateRange = { from?: string; to?: string }

export function resolveMaintenanceDateRange(
    range: MaintenanceDateRange,
    timezone: string,
    now = new Date(),
): ResolvedMaintenanceDateRange {
    if ('lastDays' in range) {
        const to = calendarDateKey(now, timezone)
        return { from: addCalendarDays(to, -(range.lastDays - 1)), to }
    }
    return { from: range.from, to: range.to }
}
