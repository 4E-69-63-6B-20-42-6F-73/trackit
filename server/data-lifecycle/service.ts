import { and, count, desc, eq, inArray, lt, max, min, notInArray } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import {
    auditEvents,
    authChallenges,
    backupRuns,
    devices,
    deviceUploadBatches,
    dailyMetrics,
    dailyProjectionRuns,
    derivedObservations,
    foods,
    goals,
    healthRecords,
    mcpClients,
    mcpActionReceipts,
    mcpConfirmations,
    observations,
    owners,
    pairingCodes,
    passkeys,
    preferences,
    projectionDirtyDates,
    recipeItems,
    recipes,
    retentionRules,
    savedTrendViews,
    sessions,
    sources,
    syncCursors,
} from '../db/schema.js'
import { markProjectionDatesDirty } from '../data/projection-state.js'
import { dateKeyInTimezone } from '../data/timezone.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Category = 'observations' | 'meals' | 'checkins'

const categoryCondition = (category: Category): SQL =>
    category === 'meals'
        ? eq(observations.category, 'Meals')
        : category === 'checkins'
          ? inArray(observations.definitionId, ['check_in', 'event'])
          : notInArray(observations.definitionId, ['meal', 'check_in', 'event'])

export class DataLifecycleService {
    private retentionTimer?: ReturnType<typeof setInterval>

    constructor(private readonly database: Database) {}

    async categorySummary(category: Category) {
        const [result] = await this.database
            .select({
                count: count(),
                oldest: min(observations.observedAt),
                newest: max(observations.observedAt),
            })
            .from(observations)
            .where(categoryCondition(category))
        const [lastRun] = await this.database
            .select({ createdAt: auditEvents.createdAt })
            .from(auditEvents)
            .where(
                and(
                    eq(auditEvents.action, 'retention.applied'),
                    eq(auditEvents.targetId, category),
                ),
            )
            .orderBy(desc(auditEvents.createdAt))
            .limit(1)
        return {
            count: result.count,
            oldest: result.oldest?.toISOString() ?? null,
            newest: result.newest?.toISOString() ?? null,
            lastRetentionRun: lastRun?.createdAt.toISOString() ?? null,
        }
    }

    start(intervalHours = 24) {
        if (this.retentionTimer) return
        const run = () => {
            void this.applyRetention().catch(error =>
                console.error({ error }, 'Scheduled retention failed'),
            )
        }
        run()
        this.retentionTimer = setInterval(run, intervalHours * 60 * 60 * 1000)
        this.retentionTimer.unref?.()
    }

    stop() {
        if (this.retentionTimer) clearInterval(this.retentionTimer)
        this.retentionTimer = undefined
    }

    listRetentionRules() {
        return this.database.select().from(retentionRules)
    }

    async setRetentionRule(category: string, days: number, enabled: boolean) {
        const [rule] = await this.database
            .insert(retentionRules)
            .values({ category, days, enabled })
            .onConflictDoUpdate({
                target: retentionRules.category,
                set: { days, enabled, updatedAt: new Date() },
            })
            .returning()
        await this.database.insert(auditEvents).values({
            actor: 'owner',
            action: 'retention.changed',
            targetType: 'category',
            targetId: category,
            metadata: { days, enabled },
        })
        return rule
    }

    private async removeObservationCategory(
        transaction: Parameters<Parameters<Database['transaction']>[0]>[0],
        category: Category,
        cutoff?: Date,
    ) {
        const conditions = [categoryCondition(category)]
        if (cutoff) conditions.push(lt(observations.observedAt, cutoff))
        const linked = await transaction
            .select({ id: observations.id, observedAt: observations.observedAt })
            .from(observations)
            .where(and(...conditions))
        if (!linked.length) return
        const [saved] = await transaction
            .select({ timezone: preferences.timezone })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        await transaction.delete(observations).where(
            inArray(
                observations.id,
                linked.map(item => item.id),
            ),
        )
        await markProjectionDatesDirty(
            transaction,
            linked.map(item => dateKeyInTimezone(item.observedAt, saved?.timezone ?? 'UTC')),
        )
    }

    async applyRetention() {
        const rules = await this.listRetentionRules()
        for (const rule of rules.filter(item => item.enabled)) {
            if (!['observations', 'meals', 'checkins'].includes(rule.category)) continue
            const cutoff = new Date(Date.now() - rule.days * 86_400_000)
            await this.database.transaction(async transaction => {
                await this.removeObservationCategory(transaction, rule.category as Category, cutoff)
                if (rule.category === 'observations')
                    await transaction
                        .delete(healthRecords)
                        .where(lt(healthRecords.startTime, cutoff))
                await transaction.insert(auditEvents).values({
                    actor: 'system',
                    action: 'retention.applied',
                    targetType: 'category',
                    targetId: rule.category,
                    metadata: { cutoff: cutoff.toISOString(), days: rule.days },
                })
            })
        }
    }

    async deleteCategory(category: Category) {
        await this.database.transaction(async transaction => {
            await this.removeObservationCategory(transaction, category)
            if (category === 'observations') {
                await transaction.delete(healthRecords)
                await transaction.delete(derivedObservations)
                await transaction.delete(dailyMetrics)
                await transaction.delete(dailyProjectionRuns)
            }
            if (category === 'meals')
                await transaction
                    .delete(derivedObservations)
                    .where(eq(derivedObservations.definitionId, 'calorie_balance'))
            await transaction.insert(auditEvents).values({
                actor: 'owner',
                action: 'data.category.deleted',
                targetType: 'category',
                targetId: category,
            })
        })
    }

    async deleteOwnerData() {
        await this.database.transaction(async transaction => {
            await transaction.delete(syncCursors)
            await transaction.delete(deviceUploadBatches)
            await transaction.delete(devices)
            await transaction.delete(pairingCodes)
            await transaction.delete(recipeItems)
            await transaction.delete(recipes)
            await transaction.delete(foods)
            await transaction.delete(observations)
            await transaction.delete(healthRecords)
            await transaction.delete(derivedObservations)
            await transaction.delete(dailyMetrics)
            await transaction.delete(dailyProjectionRuns)
            await transaction.delete(projectionDirtyDates)
            await transaction.delete(goals)
            await transaction.delete(savedTrendViews)
            await transaction.delete(mcpActionReceipts)
            await transaction.delete(mcpConfirmations)
            await transaction.delete(mcpClients)
            await transaction.delete(passkeys)
            await transaction.delete(authChallenges)
            await transaction.delete(sessions)
            await transaction.delete(preferences)
            await transaction.delete(owners)
            await transaction.delete(sources)
            await transaction.delete(retentionRules)
            await transaction.delete(backupRuns)
            await transaction.delete(auditEvents)
            await transaction.insert(auditEvents).values({
                actor: 'system',
                action: 'owner.data.deleted',
                targetType: 'installation',
                targetId: 'local',
            })
        })
    }
}
