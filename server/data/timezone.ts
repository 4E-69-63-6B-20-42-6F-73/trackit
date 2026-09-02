/**
 * Compatibility facade for legacy server imports.
 *
 * Timezone/calendar behavior belongs to @trackit/domain/calendar. Do not add logic here; migrate
 * callers to the domain module when touching them.
 */
export {
    calendarDateKey as dateKeyInTimezone,
    calendarDateKeysThrough as datesThrough,
    calendarDayRangeForKey as localDayRange,
    nextCalendarDateKey as nextDate,
} from '@trackit/domain/calendar'
