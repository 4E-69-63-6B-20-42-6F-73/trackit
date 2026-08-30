import { describe, expect, it } from 'vitest'
import { planStatus, weekDateKeys, weekStartKey, type MealPlanItem } from './planning'

const item = (changes: Partial<MealPlanItem> = {}): MealPlanItem => ({
    id: 'plan-1',
    kind: 'meal',
    scheduledDate: '2026-09-02',
    position: 0,
    skippedAt: null,
    resultObservationId: null,
    version: 1,
    meal: {
        mealType: 'Dinner',
        reference: { type: 'recipe', id: 'recipe-1', name: 'Chicken curry' },
        amount: 1,
        unit: 'serving',
    },
    ...changes,
})

describe('planning domain', () => {
    it('uses Monday as the start of a planning week', () => {
        expect(weekStartKey('2026-09-02')).toBe('2026-08-31')
        expect(weekDateKeys('2026-09-02')).toEqual([
            '2026-08-31',
            '2026-09-01',
            '2026-09-02',
            '2026-09-03',
            '2026-09-04',
            '2026-09-05',
            '2026-09-06',
        ])
    })

    it('derives status from intent and an active result observation', () => {
        expect(planStatus(item())).toBe('planned')
        expect(planStatus(item({ skippedAt: '2026-09-02T19:00:00.000Z' }))).toBe('skipped')
        expect(
            planStatus(
                item({
                    skippedAt: '2026-09-02T19:00:00.000Z',
                    resultObservationId: 'observation-1',
                }),
            ),
        ).toBe('logged')
    })
})
