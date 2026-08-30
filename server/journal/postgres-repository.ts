import { and, desc, eq, gte, isNull, lt, notExists, or, sql } from 'drizzle-orm'
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

type MealDetailView = Extract<JournalDetailView, { kind: 'meal' }>
type MetricPreferences = Record<string, { showInJournal?: boolean }>

type JournalListRow = {
    id: string
    definitionId: string
    primaryDefinitionId: string
    valueType: string
    canonicalValue: number | null
    canonicalUnit: string | null
    textValue: string | null
    category: string | null
    title: string | null
    observedAt: Date
    endedAt: Date | null
    externalId: string | null
    version: number
    createdAt: Date
    updatedAt: Date
    source: string
    projectedSummary: string | null
    projectedStartedAt: string | null
    projectedEndedAt: string | null
    plainDescription: string | null
    mealServingAmount: number | null
    mealServingUnit: string | null
    mealCalories: number | null
    mealType: string | null
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

const mealDetailView = (row: typeof observations.$inferSelect): MealDetailView | undefined => {
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

const mealSummary = (detail: MealDetailView) =>
    [
        mealServingLabel(detail.serving),
        typeof detail.nutrients.calories === 'number'
            ? `${compactNumber(detail.nutrients.calories)} kcal`
            : null,
    ]
        .filter((value): value is string => Boolean(value))
        .join(' · ') || detail.mealType

const projectedCategory = (definitionId: string) => {
    const metricCategory = metricDefinition(definitionId)?.category
    return metricCategory === 'Activity'
        ? 'Activity'
        : metricCategory === 'Sleep'
          ? 'Sleep'
          : metricCategory === 'Nutrition'
            ? 'Meals'
            : 'Measurements'
}

const toEntry = (row: typeof observations.$inferSelect): JournalEntry => {
    const attributes = row.attributes as Record<string, unknown>
    const projection = projectedDescription(attributes.description)
    const mealDetail = mealDetailView(row)
    const primaryDefinitionId =
        typeof attributes.primaryDefinitionId === 'string'
            ? attributes.primaryDefinitionId
            : row.definitionId
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
        category: (row.category ?? projectedCategory(primaryDefinitionId)) as JournalEntry['category'],
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

const toListEntry = (row: JournalListRow): JournalEntry => {
    const serving =
        row.mealServingAmount !== null &&
        row.mealServingAmount > 0 &&
        (row.mealServingUnit === 'g' || row.mealServingUnit === 'serving')
            ? ({
                  amount: row.mealServingAmount,
                  unit: row.mealServingUnit,
              } as MealServingDetail)
            : undefined
    const detail =
        row.definitionId === 'meal'
            ? [
                  mealServingLabel(serving),
                  row.mealCalories !== null ? `${compactNumber(row.mealCalories)} kcal` : null,
              ]
                  .filter((value): value is string => Boolean(value))
                  .join(' · ') || row.mealType || 'Snack'
            : (row.projectedSummary ??
              row.plainDescription ??
              row.textValue ??
              (row.valueType === 'number' && row.canonicalValue !== null
                  ? `${row.canonicalValue} ${row.canonicalUnit ?? ''}`.trim()
                  : ''))
    return {
        id: row.id,
        definitionId: row.primaryDefinitionId,
        category: (row.category ?? projectedCategory(row.primaryDefinitionId)) as JournalEntry['category'],
        title: row.title ?? row.definitionId.replaceAll('_', ' '),
        detail,
        source: row.source,
        observedAt: row.observedAt.toISOString(),
        startedAt: row.projectedStartedAt ?? row.observedAt.toISOString(),
        endedAt: row.projectedEndedAt ?? row.endedAt?.toISOString(),
        externalId: row.externalId ?? undefined,
        version: Number(row.version),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        entityType: row.definitionId === 'meal' ? 'meal' : 'observation',
        entityId: row.id,
    }
}

export class PostgresJournalRepository implements JournalRepository {
    constructor(private readonly database: Database) {}

    private component() {
        return this.database
            .select({ id: observationRelations.childObservationId })
            .from(observationRelations)
            .where(
                and(
                    eq(observationRelations.childObservationId, observations.id),
                    eq(observationRelations.kind, 'component'),
                ),
            )
    }

    private async visible() {
        const [preference] = await this.database
            .select({ metricPreferences: preferences.metricPreferences })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
            .limit(1)
        const values = (preference?.metricPreferences ?? {}) as MetricPreferences
        const disabled = Object.entries(values)
            .filter(([, value]) => value.showInJournal === false)
            .map(([definitionId]) => definitionId)
        const enabled = Object.entries(values)
            .filter(([, value]) => value.showInJournal === true)
            .map(([definitionId]) => definitionId)
        const primaryDefinitionId = sql<string>`COALESCE(${observations.attributes}->>'primaryDefinitionId', ${observations.definitionId})`
        const notDisabled = disabled.length
            ? sql`${primaryDefinitionId} NOT IN (${sql.join(
                  disabled.map(definitionId => sql`${definitionId}`),
                  sql`, `,
              )})`
            : sql`TRUE`
        const explicitlyEnabled = enabled.length
            ? sql`${primaryDefinitionId} IN (${sql.join(
                  enabled.map(definitionId => sql`${definitionId}`),
                  sql`, `,
              )})`
            : sql`FALSE`
        return sql`((${observations.category} IS NOT NULL AND ${notDisabled}) OR ${explicitlyEnabled})`
    }

    async list(filters: JournalListQuery = {}) {
        const visible = await this.visible()
        const source = sql<string>`COALESCE(
            ${observations.attributes}->>'sourceLabel',
            ${observations.metadata}->>'dataOrigin',
            CASE
                WHEN ${observations.origin} = 'external' THEN 'Imported'
                WHEN ${observations.origin} = 'derived' THEN 'TrackIt'
                ELSE 'You'
            END
        )`
        const before = filters.before ? new Date(filters.before) : null
        const beforeCondition = before
            ? filters.beforeId
                ? or(
                      lt(observations.observedAt, before),
                      and(eq(observations.observedAt, before), lt(observations.id, filters.beforeId)),
                  )
                : lt(observations.observedAt, before)
            : undefined
        const conditions = [
            eq(observations.userId, 'owner'),
            isNull(observations.deletedAt),
            visible,
            notExists(this.component()),
            ...(filters.from ? [gte(observations.observedAt, new Date(filters.from))] : []),
            ...(filters.to ? [lt(observations.observedAt, new Date(filters.to))] : []),
            ...(beforeCondition ? [beforeCondition] : []),
            ...(filters.category ? [eq(observations.category, filters.category)] : []),
            ...(filters.source ? [sql`${source} = ${filters.source}`] : []),
        ]
        const rows = await this.database
            .select({
                id: observations.id,
                definitionId: observations.definitionId,
                primaryDefinitionId: sql<string>`COALESCE(${observations.attributes}->>'primaryDefinitionId', ${observations.definitionId})`,
                valueType: observations.valueType,
                canonicalValue: observations.canonicalValue,
                canonicalUnit: observations.canonicalUnit,
                textValue: observations.textValue,
                category: observations.category,
                title: observations.title,
                observedAt: observations.observedAt,
                endedAt: observations.endedAt,
                externalId: observations.externalId,
                version: observations.version,
                createdAt: observations.createdAt,
                updatedAt: observations.updatedAt,
                source,
                projectedSummary: sql<string | null>`${observations.attributes}->'description'->>'summary'`,
                projectedStartedAt: sql<string | null>`${observations.attributes}->'description'->>'startedAt'`,
                projectedEndedAt: sql<string | null>`${observations.attributes}->'description'->>'endedAt'`,
                plainDescription: sql<string | null>`CASE
                    WHEN jsonb_typeof(${observations.attributes}->'description') = 'string'
                    THEN ${observations.attributes}->>'description'
                    ELSE NULL
                END`,
                mealServingAmount: sql<number | null>`CASE
                    WHEN ${observations.definitionId} = 'meal'
                    THEN NULLIF(${observations.attributes}->'serving'->>'amount', '')::double precision
                    ELSE NULL
                END`,
                mealServingUnit: sql<string | null>`${observations.attributes}->'serving'->>'unit'`,
                mealCalories: sql<number | null>`CASE
                    WHEN ${observations.definitionId} = 'meal'
                    THEN NULLIF(${observations.attributes}->'nutrientSnapshot'->>'calories', '')::double precision
                    ELSE NULL
                END`,
                mealType: sql<string | null>`${observations.attributes}->>'mealType'`,
            })
            .from(observations)
            .where(and(...conditions))
            .orderBy(desc(observations.observedAt), desc(observations.id))
            .limit(Math.min(filters.limit ?? 100, 100))
        return rows.map(row => toListEntry(row as JournalListRow))
    }

    async get(id: string) {
        const visible = await this.visible()
        const [row] = await this.database
            .select()
            .from(observations)
            .where(
                and(
                    eq(observations.id, id),
                    eq(observations.userId, 'owner'),
                    isNull(observations.deletedAt),
                    visible,
                    notExists(this.component()),
                ),
            )
            .limit(1)
        return row ? toEntry(row) : null
    }

    async ready() {
        await this.database.select({ id: observations.id }).from(observations).limit(1)
        return true
    }
}
