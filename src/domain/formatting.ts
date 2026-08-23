const sourceNames: Record<string, string> = {
    'com.google.android.apps.fitness': 'Google Fit',
    'com.fitbit.FitbitMobile': 'Fitbit',
    'cn.fitdays.fitdays': 'Fitdays scale',
    'com.google.android.apps.healthdata': 'Health Connect',
}

export function friendlySourceName(source?: string | null) {
    if (!source) return 'Unknown source'
    if (source.toLowerCase() === 'you') return 'You'
    const raw = source.replace(/^Health Connect\s*[·â€¢-]\s*/i, '')
    if (/^health connect$/i.test(raw)) return 'Health Connect'
    const match = Object.entries(sourceNames).find(
        ([id]) => id.toLowerCase() === raw.toLowerCase(),
    )
    if (match) return match[1]
    if (raw.includes('.') && !raw.includes(' ')) {
        const candidate = raw.split('.').at(-1)?.replaceAll(/[_-]/g, ' ')
        if (candidate) return candidate.replace(/^./, letter => letter.toUpperCase())
    }
    return raw
}

export function formatMetricValue(
    value: number,
    unit: string,
    locale?: string,
    options?: { signed?: boolean },
) {
    if (unit === 'hours') {
        const minutes = Math.round(Math.abs(value) * 60)
        const prefix = options?.signed ? (value > 0 ? '+' : value < 0 ? '−' : '') : ''
        const hours = Math.floor(minutes / 60)
        const remainder = minutes % 60
        return `${prefix}${hours ? `${hours} h${remainder ? ' ' : ''}` : ''}${remainder ? `${remainder} min` : hours ? '' : '0 min'}`
    }
    const precision = ['kg', 'lb', '%', 'L', 'm'].includes(unit) ? 1 : 0
    const formatted = Math.abs(value).toLocaleString(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: precision,
    })
    const prefix = options?.signed ? (value > 0 ? '+' : value < 0 ? '−' : '') : ''
    const label = unit === 'count' ? 'steps' : unit === 'score' ? '/10' : unit
    return `${prefix}${formatted}${label === '/10' ? label : ` ${label}`}`
}
