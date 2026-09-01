import { describe, expect, it } from 'vitest'
import { planStatus, weekDateKeys, weekStartKey, type MealPlanItem } from '@trackit/domain/planning'

const item = (changes: Partial<MealPlanItem> = {}): MealPlanItem => ({
    id: 'plan-1',
    kind: 'meal',
    scheduledDate: '2026-09-02',
    scheduledTime: null,
    position: 0,
    skippedAt: null,
    resultObservationId: null,
    version: 1,
    meal: {
        mealType: 'Dinner',
        reference: { type: 'recipe', id: 'recipe-1', name: 'Chicken curry' },
        amount: 1,
        unit: 'serving',
        fulfilledAmount: 0,
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

    it('tracks partial and complete food group targets', () => {
        const flexible = item({
            meal: {
                mealType: 'Snack',
                reference: { type: 'category', id: 'fruit', name: 'Fruit' },
                amount: 200,
                unit: 'g',
                fulfilledAmount: 120,
            },
        })
        expect(planStatus(flexible)).toBe('partial')
        expect(
            planStatus({
                ...flexible,
                meal: { ...flexible.meal, fulfilledAmount: 205 },
            }),
        ).toBe('logged')
    })
})
