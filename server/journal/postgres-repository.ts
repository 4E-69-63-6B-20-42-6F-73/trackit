import { and, desc, eq, gte, isNull, lt, notExists, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { observationRelations, observations, preferences } from '../db/schema.js'
import { metricDefinition } from '../../src/domain/metricCatalog.js'
import type {
    JournalDetailView,
    JournalEntry,
    JournalListQuery,
    JournalRepository,
    MealServingDetail,
} from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>

type ProjectedDescription = {
    projectionVersion: 1
    summary: string
    startedAt?: string
    endedAt?: string
    detailView?: JournalDetailView
}

type MealAttributes = {
    mealType?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
    nutrientSnapshot?: Record<string, unknown>
    nutritionQuality?: 'complete' | 'estimated' | 'incomplete'
    serving?: unknown
}

const sourceLabel = (row: typeof observations.$inferSelect) => {
    const attributes = row.attributes as Record<string, unknown>
    const metadata = row.metadata as Record<string, unknown>
    return typeof attributes.sourceLabel === 'string'
        ? attributes.sourceLabel
        : typeof metadata.dataOrigin === 'string'
          ? metadata.dataOrigin
          : row.origin === 'external'
            ? 'Imported'
            : row.origin === 'derived'
              ? 'TrackIt'
              : 'You'
}

const projectedDescription = (value: unknown): ProjectedDescription | null => {
    if (!value || typeof value !== 'object') return null
    const candidate = value as Record<string, unknown>
    if (candidate.projectionVersion !== 1 || typeof candidate.summary !== 'string') return null
    return candidate as ProjectedDescription
}

const compactNumber = (value: number) => String(Math.round(value * 100) / 100)

const mealServing = (value: unknown): MealServingDetail | undefined => {
    if (!value || typeof value !== 'object') return undefined
    const candidate = value as Record<string, unknown>
    if (
        typeof candidate.amount !== 'number' ||
        !Number.isFinite(candidate.amount) ||
        candidate.amount <= 0 ||
        !['g', 'serving'].includes(String(candidate.unit))
    )
        return undefined
    return {
        amount: candidate.amount,
        unit: candidate.unit as MealServingDetail['unit'],
    }
}

const mealDetailView = (row: typeof observations.$inferSelect): JournalDetailView | undefined => {
    if (row.definitionId !== 'meal') return undefined
    const attributes = row.attributes as MealAttributes
    const nutrients = Object.fromEntries(
        Object.entries(attributes.nutrientSnapshot ?? {}).filter(
            (entry): entry is [string, number] =>
                typeof entry[1] === 'number' && Number.isFinite(entry[1]),
        ),
    )
    return {
        kind: 'meal',
        mealType: attributes.mealType ?? 'Snack',
        serving: mealServing(attributes.serving),
        nutrients,
        nutritionQuality: attributes.nutritionQuality ?? 'complete',
    }
}

const mealServingLabel = (serving?: MealServingDetail) => {
    if (!serving) return null
    if (serving.unit === 'g') return `${compactNumber(serving.amount)} g`
    return `${compactNumber(serving.amount)} ${serving.amount === 1 ? 'serving' : 'servings'}`
}

const mealSummary = (detail: Extract<JournalDetailView, { kind: 'meal' }>) =>
    [
        mealServingLabel(detail.serving),
        typeof detail.nutrients.calories === 'number'
            ? `${compactNumber(detail.nutrients.calories)} kcal`
            : null,
    ]
        .filter((value): value is string => Boolean(value))
        .join(' · ') || detail.mealType

const toEntry = (row: typeof observations.$inferSelect): JournalEntry => {
    const attributes = row.attributes as Record<string, unknown>
    const projection = projectedDescription(attributes.description)
    const mealDetail = mealDetailView(row)
    const primaryDefinitionId =
        typeof attributes.primaryDefinitionId === 'string'
            ? attributes.primaryDefinitionId
            : row.definitionId
    const metricCategory = metricDefinition(primaryDefinitionId)?.category
    const projectedCategory =
        metricCategory === 'Activity'
            ? 'Activity'
            : metricCategory === 'Sleep'
              ? 'Sleep'
              : metricCategory === 'Nutrition'
                ? 'Meals'
                : 'Measurements'
    const detail = mealDetail
        ? mealSummary(mealDetail)
        : projection
          ? projection.summary
          : typeof attributes.description === 'string'
            ? attributes.description
            : (row.textValue ??
              (row.valueType === 'number' && row.canonicalValue !== null
                  ? `${row.canonicalValue} ${row.canonicalUnit ?? ''}`.trim()
                  : ''))
    return {
        id: row.id,
        definitionId: primaryDefinitionId,
        category: (row.category ?? projectedCategory) as JournalEntry['category'],
        title: row.title ?? row.definitionId.replaceAll('_', ' '),
        detail,
        source: sourceLabel(row),
        observedAt: row.observedAt.toISOString(),
        startedAt: projection?.startedAt ?? row.observedAt.toISOString(),
        endedAt: projection?.endedAt ?? row.endedAt?.toISOString(),
        externalId: row.externalId ?? undefined,
        version: Number(row.version),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        entityType: row.definitionId === 'meal' ? 'meal' : 'observation',
        entityId: row.id,
        detailView: mealDetail ?? projection?.detailView,
    }
}

export class PostgresJournalRepository implements JournalRepository {
    constructor(private readonly database: Database) {}

    async list(filters: JournalListQuery = {}) {
        const component = this.database
            .select({ id: observationRelations.childObservationId })
            .from(observationRelations)
            .where(
                and(
                    eq(observationRelations.childObservationId, observations.id),
                    eq(observationRelations.kind, 'component'),
                ),
            )
        const preference = sql<string | null>`(
            SELECT ${preferences.metricPreferences}
                -> COALESCE(${observations.attributes}->>'primaryDefinitionId', ${observations.definitionId})
                ->> 'showInJournal'
            FROM ${preferences}
            WHERE ${preferences.id} = 'owner'
        )`
        const visible = sql`(
            (${observations.category} IS NOT NULL AND COALESCE(${preference}, 'true') <> 'false')
            OR ${preference} = 'true'
        )`
        const conditions = [
            isNull(observations.deletedAt),
            visible,
            notExists(component),
            ...(filters.from ? [gte(observations.observedAt, new Date(filters.from))] : []),
            ...(filters.to ? [lt(observations.observedAt, new Date(filters.to))] : []),
            ...(filters.before ? [lt(observations.observedAt, new Date(filters.before))] : []),
            ...(filters.category ? [eq(observations.category, filters.category)] : []),
        ]
        const rows = await this.database
            .select()
            .from(observations)
            .where(and(...conditions))
            .orderBy(desc(observations.observedAt))
            .limit(Math.min(filters.limit ?? 100, 100))
        return rows.map(toEntry).filter(entry => !filters.source || entry.source === filters.source)
    }

    async ready() {
        await this.database.select({ id: observations.id }).from(observations).limit(1)
        return true
    }
}
