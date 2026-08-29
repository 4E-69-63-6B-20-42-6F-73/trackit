const partsFor = (date: Date, timeZone: string) =>
    Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone,
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
    ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>

export const dateKeyInTimezone = (date: Date, timeZone = 'UTC') => {
    const parts = partsFor(date, timeZone)
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export const todayKeyInTimezone = (timeZone = 'UTC') => dateKeyInTimezone(new Date(), timeZone)

export const addDaysToDateKey = (dateKey: string, days: number) => {
    const date = new Date(`${dateKey}T12:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

const zonedMidnightUtc = (dateKey: string, timeZone: string) => {
    const [year, month, day] = dateKey.split('-').map(Number)
    let instant = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
    for (let index = 0; index < 3; index += 1) {
        const rendered = partsFor(instant, timeZone)
        const renderedAsUtc = Date.UTC(
            rendered.year,
            rendered.month - 1,
            rendered.day,
            rendered.hour,
            rendered.minute,
            rendered.second,
        )
        const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0)
        instant = new Date(instant.getTime() + (targetAsUtc - renderedAsUtc))
    }
    return instant
}

export const dayRangeInTimezone = (dateKey: string, timeZone = 'UTC') => ({
    from: zonedMidnightUtc(dateKey, timeZone).toISOString(),
    to: zonedMidnightUtc(addDaysToDateKey(dateKey, 1), timeZone).toISOString(),
})

export const formatDateKey = (
    dateKey: string,
    locale?: string,
    options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
) => new Date(`${dateKey}T12:00:00.000Z`).toLocaleDateString(locale, { ...options, timeZone: 'UTC' })
