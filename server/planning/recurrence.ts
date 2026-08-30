import { createHash, randomUUID } from 'node:crypto'
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type * as schemaType from '../db/schema.js'
import { foods, recipes } from '../db/schema.js'
import { foodCategories } from '../nutrition/schema.js'
import {
    planFulfillments,
    planItems,
    planScheduleTimes,
    plannedMealCategories,
    plannedMeals,
} from './schema.js'

type Database = PostgresJsDatabase<typeof schemaType>

export type PlanScheduleSummary = {
    id: string
    weekdays: number[]
    version: number
}

export const recurringScheduleKind = 'meal_schedule_rule'
const recurringOccurrencePrefix = 'meal_schedule_occurrence:'

export const recurringOccurrenceKind = (scheduleId: string) =>
    `${recurringOccurrencePrefix}${scheduleId}`

export const scheduleIdFromPlanKind = (kind: string) =>
    kind.startsWith(recurringOccurrencePrefix) ? kind.slice(recurringOccurrencePrefix.length) : null

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const scheduledTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const mealTypeSchema = z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack'])
const categoryIdSchema = z.string().regex(/^[a-z0-9-]{1,60}$/)
const referenceSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('food'), id: z.string().uuid() }),
    z.object({ type: z.literal('recipe'), id: z.string().uuid() }),
    z.object({ type: z.literal('category'), id: categoryIdSchema }),
])
const weekdaysSchema = z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine(days => new Set(days).size === days.length)
const createScheduleSchema = z.object({
    startDate: dateKeySchema,
    scheduledTime: scheduledTimeSchema.nullable().optional(),
    mealType: mealTypeSchema,
    reference: referenceSchema,
    amount: z.number().finite().positive(),
    weekdays: weekdaysSchema,
})
const stopScheduleSchema = z.object({
    version: z.number().int().positive(),
    fromDate: dateKeySchema,
})

type PlanReference = z.infer<typeof referenceSchema>

const weekdaysToMask = (weekdays: number[]) =>
    weekdays.reduce((mask, weekday) => mask | (1 << weekday), 0)

export const weekdaysFromMask = (mask: number) =>
    Array.from({ length: 7 }, (_, weekday) => weekday).filter(
        weekday => (mask & (1 << weekday)) !== 0,
    )

const weekdayForDate = (dateKey: string) => new Date(`${dateKey}T12:00:00.000Z`).getUTCDay()

const addDays = (dateKey: string, amount: number) => {
    const date = new Date(`${dateKey}T12:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + amount)
    return date.toISOString().slice(0, 10)
}

const occurrenceId = (scheduleId: string, dateKey: string) => {
    const hash = createHash('sha256').update(`${scheduleId}:${dateKey}`).digest('hex')
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}

const referenceExists = async (database: Database, reference: PlanReference) => {
    if (reference.type === 'food')
        return Boolean(
            (
                await database
                    .select({ id: foods.id })
                    .from(foods)
                    .where(eq(foods.id, reference.id))
                    .limit(1)
            )[0],
        )
    if (reference.type === 'recipe')
        return Boolean(
            (
                await database
                    .select({ id: recipes.id })
                    .from(recipes)
                    .where(eq(recipes.id, reference.id))
                    .limit(1)
            )[0],
        )
    return Boolean(
        (
            await database
                .select({ id: foodCategories.id })
                .from(foodCategories)
                .where(eq(foodCategories.id, reference.id))
                .limit(1)
        )[0],
    )
}

export async function materializeRecurringPlanItems(
    database: Database,
    fromDate: string,
    toDate: string,
) {
    if (fromDate > toDate) return
    const schedules = await database
        .select({
            id: planItems.id,
            startDate: planItems.scheduledDate,
            weekdayMask: planItems.position,
            scheduledTime: planScheduleTimes.scheduledTime,
            mealType: plannedMeals.mealType,
            referenceType: plannedMeals.referenceType,
            foodId: plannedMeals.foodId,
            recipeId: plannedMeals.recipeId,
            categoryId: plannedMealCategories.categoryId,
            amount: plannedMeals.amount,
            unit: plannedMeals.unit,
        })
        .from(planItems)
        .innerJoin(plannedMeals, eq(plannedMeals.planItemId, planItems.id))
        .leftJoin(planScheduleTimes, eq(planScheduleTimes.planItemId, planItems.id))
        .leftJoin(plannedMealCategories, eq(plannedMealCategories.planItemId, planItems.id))
        .where(
            and(
                eq(planItems.userId, 'owner'),
                eq(planItems.kind, recurringScheduleKind),
                isNull(planItems.deletedAt),
                lte(planItems.scheduledDate, toDate),
            ),
        )

    if (!schedules.length) return

    await database.transaction(async transaction => {
        for (const schedule of schedules) {
            const weekdays = new Set(weekdaysFromMask(schedule.weekdayMask))
            const firstDate = schedule.startDate > fromDate ? schedule.startDate : fromDate
            for (let date = firstDate; date <= toDate; date = addDays(date, 1)) {
                if (!weekdays.has(weekdayForDate(date))) continue
                const [created] = await transaction
                    .insert(planItems)
                    .values({
                        id: occurrenceId(schedule.id, date),
                        kind: recurringOccurrenceKind(schedule.id),
                        scheduledDate: date,
                        position: 0,
                    })
                    .onConflictDoNothing()
                    .returning({ id: planItems.id })
                if (!created) continue
                await transaction.insert(plannedMeals).values({
                    planItemId: created.id,
                    mealType: schedule.mealType,
                    referenceType: schedule.referenceType,
                    foodId: schedule.foodId,
                    recipeId: schedule.recipeId,
                    amount: schedule.amount,
                    unit: schedule.unit,
                })
                if (schedule.referenceType === 'category' && schedule.categoryId)
                    await transaction.insert(plannedMealCategories).values({
                        planItemId: created.id,
                        categoryId: schedule.categoryId,
                    })
                if (schedule.scheduledTime)
                    await transaction.insert(planScheduleTimes).values({
                        planItemId: created.id,
                        scheduledTime: schedule.scheduledTime,
                    })
            }
        }
    })
}

export async function loadRecurringScheduleMetadata(database: Database, planKinds: string[]) {
    const ids = Array.from(
        new Set(
            planKinds
                .map(scheduleIdFromPlanKind)
                .filter((id): id is string => Boolean(id)),
        ),
    )
    if (!ids.length) return new Map<string, PlanScheduleSummary>()
    const rows = await database
        .select({ id: planItems.id, weekdayMask: planItems.position, version: planItems.version })
        .from(planItems)
        .where(
            and(
                inArray(planItems.id, ids),
                eq(planItems.kind, recurringScheduleKind),
                isNull(planItems.deletedAt),
            ),
        )
    return new Map(
        rows.map(row => [
            row.id,
            {
                id: row.id,
                weekdays: weekdaysFromMask(row.weekdayMask),
                version: Number(row.version),
            },
        ]),
    )
}

export function registerRecurringPlanRoutes(app: FastifyInstance, database: Database) {
    app.post('/api/plan-schedules', async (request, reply) => {
        const parsed = createScheduleSchema.safeParse(request.body)
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_plan_schedule' })
        const input = parsed.data
        if (!(await referenceExists(database, input.reference)))
            return reply.code(404).send({ error: 'reference_not_found' })

        const scheduleId = randomUUID()
        const schedule = await database.transaction(async transaction => {
            const [rule] = await transaction
                .insert(planItems)
                .values({
                    id: scheduleId,
                    kind: recurringScheduleKind,
                    scheduledDate: input.startDate,
                    position: weekdaysToMask(input.weekdays),
                })
                .returning()
            await transaction.insert(plannedMeals).values({
                planItemId: rule.id,
                mealType: input.mealType,
                referenceType: input.reference.type,
                foodId: input.reference.type === 'food' ? input.reference.id : null,
                recipeId: input.reference.type === 'recipe' ? input.reference.id : null,
                amount: input.amount,
                unit: input.reference.type === 'recipe' ? 'serving' : 'g',
            })
            if (input.reference.type === 'category')
                await transaction.insert(plannedMealCategories).values({
                    planItemId: rule.id,
                    categoryId: input.reference.id,
                })
            if (input.scheduledTime)
                await transaction.insert(planScheduleTimes).values({
                    planItemId: rule.id,
                    scheduledTime: input.scheduledTime,
                })
            return rule
        })

        return reply.code(201).send({
            data: {
                id: schedule.id,
                weekdays: [...input.weekdays].sort((left, right) => left - right),
                version: Number(schedule.version),
            },
        })
    })

    app.delete<{ Params: { id: string } }>('/api/plan-schedules/:id', async (request, reply) => {
        const parsed = stopScheduleSchema.safeParse(request.body)
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_plan_schedule' })
        const input = parsed.data
        const [schedule] = await database
            .update(planItems)
            .set({
                deletedAt: new Date(),
                version: input.version + 1,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(planItems.id, request.params.id),
                    eq(planItems.kind, recurringScheduleKind),
                    eq(planItems.version, input.version),
                    isNull(planItems.deletedAt),
                ),
            )
            .returning({ id: planItems.id })
        if (!schedule) return reply.code(409).send({ error: 'version_conflict' })

        const occurrences = await database
            .select({ id: planItems.id, resultObservationId: planItems.resultObservationId })
            .from(planItems)
            .where(
                and(
                    eq(planItems.kind, recurringOccurrenceKind(request.params.id)),
                    gte(planItems.scheduledDate, input.fromDate),
                    isNull(planItems.deletedAt),
                ),
            )
        const occurrenceIds = occurrences.map(item => item.id)
        const fulfillments = occurrenceIds.length
            ? await database
                  .select({ planItemId: planFulfillments.planItemId })
                  .from(planFulfillments)
                  .where(inArray(planFulfillments.planItemId, occurrenceIds))
            : []
        const fulfilledIds = new Set(fulfillments.map(item => item.planItemId))
        const removableIds = occurrences
            .filter(item => !item.resultObservationId && !fulfilledIds.has(item.id))
            .map(item => item.id)
        if (removableIds.length)
            await database
                .update(planItems)
                .set({ deletedAt: new Date(), updatedAt: new Date() })
                .where(inArray(planItems.id, removableIds))

        return reply.code(204).send()
    })
}
