import { inArray, lt } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import {
    auditEvents,
    authChallenges,
    backupRuns,
    devices,
    deviceUploadBatches,
    foods,
    goals,
    journalEntries,
    mcpClients,
    mcpActionReceipts,
    mcpConfirmations,
    mealItems,
    meals,
    observations,
    owners,
    pairingCodes,
    passkeys,
    preferences,
    recipeItems,
    recipes,
    retentionRules,
    savedTrendViews,
    sessions,
    sources,
    syncCursors,
} from '../db/schema.js'

type Database = PostgresJsDatabase<typeof schemaType>

export class DataLifecycleService {
    private retentionTimer?: ReturnType<typeof setInterval>

    constructor(private readonly database: Database) {}

    start(intervalHours = 24) {
        if (this.retentionTimer) return
        const run = () => {
            void this.applyRetention().catch(error => {
                console.error({ error }, 'Scheduled retention failed')
            })
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

    async applyRetention() {
        const rules = await this.listRetentionRules()
        for (const rule of rules.filter(item => item.enabled)) {
            const cutoff = new Date(Date.now() - rule.days * 24 * 60 * 60 * 1000)
            if (rule.category === 'observations') {
                const linked = await this.database
                    .select({ id: observations.id })
                    .from(observations)
                    .where(lt(observations.observedAt, cutoff))
                if (linked.length) {
                    await this.database.delete(journalEntries).where(
                        inArray(
                            journalEntries.id,
                            linked.map(record => record.id),
                        ),
                    )
                }
                await this.database.delete(observations).where(lt(observations.observedAt, cutoff))
            } else if (rule.category === 'meals') {
                const linked = await this.database
                    .select({ id: meals.id })
                    .from(meals)
                    .where(lt(meals.eatenAt, cutoff))
                if (linked.length) {
                    await this.database.delete(journalEntries).where(
                        inArray(
                            journalEntries.id,
                            linked.map(record => record.id),
                        ),
                    )
                }
                await this.database.delete(meals).where(lt(meals.eatenAt, cutoff))
            } else if (rule.category === 'journal') {
                await this.database
                    .delete(journalEntries)
                    .where(lt(journalEntries.observedAt, cutoff))
            }
            await this.database.insert(auditEvents).values({
                actor: 'system',
                action: 'retention.applied',
                targetType: 'category',
                targetId: rule.category,
                metadata: { cutoff: cutoff.toISOString(), days: rule.days },
            })
        }
    }

    async deleteCategory(category: 'observations' | 'meals' | 'journal') {
        await this.database.transaction(async transaction => {
            if (category === 'observations') {
                const linked = await transaction.select({ id: observations.id }).from(observations)
                if (linked.length) {
                    await transaction.delete(journalEntries).where(
                        inArray(
                            journalEntries.id,
                            linked.map(record => record.id),
                        ),
                    )
                }
                await transaction.delete(observations)
            }
            if (category === 'meals') {
                const linked = await transaction.select({ id: meals.id }).from(meals)
                if (linked.length) {
                    await transaction.delete(journalEntries).where(
                        inArray(
                            journalEntries.id,
                            linked.map(record => record.id),
                        ),
                    )
                }
                await transaction.delete(meals)
            }
            if (category === 'journal') await transaction.delete(journalEntries)
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
            await transaction.delete(mealItems)
            await transaction.delete(meals)
            await transaction.delete(recipeItems)
            await transaction.delete(recipes)
            await transaction.delete(foods)
            await transaction.delete(observations)
            await transaction.delete(journalEntries)
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
