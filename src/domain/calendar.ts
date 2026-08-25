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

const zonedDateTime = (timezone: string, year: number, month: number, day: number) => {
    const desired = Date.UTC(year, month - 1, day)
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
