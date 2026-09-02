const zonedParts = (date: Date, timezone: string) =>
    Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(date)
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, Number(part.value)]),
    ) as Record<string, number>

const zonedDateTime = (
    timezone: string,
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
) => {
    const desired = Date.UTC(year, month - 1, day, hour, minute, second)
    let instant = desired
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const actual = zonedParts(new Date(instant), timezone)
        instant +=
            desired -
            Date.UTC(
                actual.year,
                actual.month - 1,
                actual.day,
                actual.hour,
                actual.minute,
                actual.second,
            )
    }
    return new Date(instant)
}

export function calendarDateKey(date: Date, timezone: string) {
    const value = zonedParts(date, timezone)
    return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

export const calendarTodayKey = (timezone: string) => calendarDateKey(new Date(), timezone)

export const addCalendarDays = (dateKey: string, days: number) => {
    const value = new Date(`${dateKey}T12:00:00.000Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
}

export const nextCalendarDateKey = (dateKey: string) => addCalendarDays(dateKey, 1)

export function calendarDateKeysThrough(from: string, to: string) {
    const dates: string[] = []
    for (let date = from; date <= to; date = nextCalendarDateKey(date)) dates.push(date)
    return dates
}

export const calendarDateFromKey = (dateKey: string, timezone: string) => {
    const [year, month, day] = dateKey.split('-').map(Number)
    return zonedDateTime(timezone, year, month, day)
}

export function calendarDayRange(date: Date, timezone: string) {
    const value = zonedParts(date, timezone)
    const from = zonedDateTime(timezone, value.year, value.month, value.day)
    const next = new Date(Date.UTC(value.year, value.month - 1, value.day + 1))
    const to = zonedDateTime(
        timezone,
        next.getUTCFullYear(),
        next.getUTCMonth() + 1,
        next.getUTCDate(),
    )
    return { from, to }
}

export const calendarDayRangeForKey = (dateKey: string, timezone: string) => {
    const from = calendarDateFromKey(dateKey, timezone)
    const to = calendarDateFromKey(nextCalendarDateKey(dateKey), timezone)
    return { from, to }
}

export const calendarWeekdayIndexForKey = (dateKey: string) =>
    new Date(`${dateKey}T12:00:00.000Z`).getUTCDay()

export const calendarWeekdayIndex = (date: Date, timezone: string) =>
    calendarWeekdayIndexForKey(calendarDateKey(date, timezone))

export const calendarLocalDateTimeValue = (date: Date, timezone: string) => {
    const value = zonedParts(date, timezone)
    return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}T${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`
}

export const calendarLocalDateTimeToInstant = (value: string, timezone: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
    if (!match) return new Date(value)
    return zonedDateTime(
        timezone,
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
    )
}

export const formatCalendarDate = (
    dateKey: string,
    locale?: string,
    options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
) =>
    new Date(`${dateKey}T12:00:00.000Z`).toLocaleDateString(locale, { ...options, timeZone: 'UTC' })
