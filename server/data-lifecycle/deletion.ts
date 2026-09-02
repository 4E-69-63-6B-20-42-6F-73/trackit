import { and, count, eq, inArray, isNull, max, min, ne, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { calendarDateKey } from '@trackit/domain/calendar'
import type * as schemaType from '../db/schema.js'
import {
    auditEvents,
    authChallenges,
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
    savedTrendViews,
    sessions,
    sources,
    syncCursors,
} from '../db/schema.js'
import { markProjectionDatesDirty } from '../data/projection-state.js'
import { planItems } from '../planning/schema.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Category = 'observations' | 'meals' | 'checkins'

const categoryCondition = (category: Category): SQL =>
    category === 'meals'
        ? eq(observations.category, 'Meals')
        : category === 'checkins'
          ? eq(observations.category, 'Check-ins')
          : or(
                isNull(observations.category),
                and(ne(observations.category, 'Meals'), ne(observations.category, 'Check-ins')),
            )!

export class DataDeletionService {
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
        return {
            count: result.count,
            oldest: result.oldest?.toISOString() ?? null,
            newest: result.newest?.toISOString() ?? null,
        }
    }

    private async removeObservationCategory(
        transaction: Parameters<Parameters<Database['transaction']>[0]>[0],
        category: Category,
    ) {
        const conditions = [categoryCondition(category)]
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
            linked.map(item => calendarDateKey(item.observedAt, saved?.timezone ?? 'UTC')),
        )
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
            await transaction.delete(planItems)
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
