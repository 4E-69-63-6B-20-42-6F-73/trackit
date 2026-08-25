const formatter = (timeZone: string) =>
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

const offsetAt = (instant: Date, timeZone: string) => {
    const parts = Object.fromEntries(
        formatter(timeZone)
            .formatToParts(instant)
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, Number(part.value)]),
    )
    const represented = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
    )
    return represented - instant.getTime()
}

export function nextDate(date: string) {
    const value = new Date(`${date}T00:00:00.000Z`)
    value.setUTCDate(value.getUTCDate() + 1)
    return value.toISOString().slice(0, 10)
}

export function datesThrough(from: string, to: string) {
    const dates: string[] = []
    for (let date = from; date <= to; date = nextDate(date)) dates.push(date)
    return dates
}

export function localDateBoundary(date: string, timeZone: string) {
    const candidate = new Date(`${date}T00:00:00.000Z`)
    let instant = new Date(candidate.getTime() - offsetAt(candidate, timeZone))
    instant = new Date(candidate.getTime() - offsetAt(instant, timeZone))
    return instant
}

export function localDayRange(date: string, timeZone: string) {
    return {
        from: localDateBoundary(date, timeZone),
        to: localDateBoundary(nextDate(date), timeZone),
    }
}

export function dateKeyInTimezone(instant: Date, timeZone: string) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(instant)
}
