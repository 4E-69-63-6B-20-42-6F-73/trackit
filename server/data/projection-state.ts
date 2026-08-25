import { asc, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { projectionDirtyDates } from '../db/schema.js'
import { rebuildEffectiveDailyMetric } from './daily-projection.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function markProjectionDirty(database: Database | Transaction, date: string) {
    await database
        .insert(projectionDirtyDates)
        .values({ userId: 'owner', date })
        .onConflictDoUpdate({
            target: [projectionDirtyDates.userId, projectionDirtyDates.date],
            set: { createdAt: new Date() },
        })
}

export async function markProjectionDatesDirty(
    database: Database | Transaction,
    dates: Iterable<string>,
) {
    for (const date of new Set(dates)) await markProjectionDirty(database, date)
}

export class ProjectionWorker {
    private timer?: ReturnType<typeof setInterval>
    private running = false

    constructor(
        private readonly database: Database,
        private readonly log: Pick<Console, 'error'> = console,
    ) {}

    async runOnce(limit = 25) {
        if (this.running) return 0
        this.running = true
        try {
            const pending = await this.database
                .select({ date: projectionDirtyDates.date })
                .from(projectionDirtyDates)
                .where(eq(projectionDirtyDates.userId, 'owner'))
                .orderBy(asc(projectionDirtyDates.createdAt))
                .limit(limit)
            let completed = 0
            for (const item of pending) {
                try {
                    await rebuildEffectiveDailyMetric(this.database, item.date)
                    completed += 1
                } catch (error) {
                    this.log.error({ error, date: item.date }, 'Projection rebuild failed')
                }
            }
            return completed
        } finally {
            this.running = false
        }
    }

    start(intervalMs = 5_000) {
        if (this.timer) return
        void this.runOnce()
        this.timer = setInterval(() => void this.runOnce(), intervalMs)
        this.timer.unref?.()
    }

    stop() {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
    }
}
