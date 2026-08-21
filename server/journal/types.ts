import { z } from 'zod'

export const categorySchema = z.enum(['Meals', 'Activity', 'Sleep', 'Measurements', 'Check-ins'])

export const createJournalEntrySchema = z.object({
    id: z.string().uuid().optional(),
    category: categorySchema,
    title: z.string().trim().min(1).max(160),
    detail: z.string().trim().max(2000).default(''),
    source: z.string().trim().min(1).max(120).default('You'),
    observedAt: z.string().datetime(),
    externalId: z.string().max(255).optional(),
})

export type CreateJournalEntry = z.infer<typeof createJournalEntrySchema>
export type JournalEntityLink = { entityType?: 'meal' | 'observation'; entityId?: string }
export type JournalEntry = CreateJournalEntry & {
    id: string
    version: number
    createdAt: string
    updatedAt: string
} & JournalEntityLink

export const updateJournalEntrySchema = z.object({
    title: z.string().trim().min(1).max(160).optional(),
    detail: z.string().trim().max(2000).optional(),
    observedAt: z.string().datetime().optional(),
    version: z.number().int().positive(),
})

export type UpdateJournalEntry = z.infer<typeof updateJournalEntrySchema>

export interface JournalRepository {
    list(): Promise<JournalEntry[]>
    create(input: CreateJournalEntry & JournalEntityLink): Promise<JournalEntry>
    update(id: string, input: UpdateJournalEntry): Promise<JournalEntry | null>
    remove(id: string): Promise<boolean>
    ready(): Promise<boolean>
}
