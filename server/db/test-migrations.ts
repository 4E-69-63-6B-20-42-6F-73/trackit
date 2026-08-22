import { readFile, readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
export async function migrationFiles() {
    return (await readdir('server/db/migrations'))
        .filter(filename => /^\d{4}_.+\.sql$/.test(filename))
        .sort()
}

export async function applyTestMigrations(
    database: { exec(sql: string): Promise<unknown> },
    files?: string[],
) {
    for (const filename of files ?? (await migrationFiles())) {
        const migration = await readFile(`server/db/migrations/${filename}`, 'utf8')
        await database.exec(migration.replaceAll('--> statement-breakpoint', ''))
    }
}

describe('migration metadata', () => {
    it('registers every migration in the Drizzle journal', async () => {
        const files = (await readdir('server/db/migrations'))
            .filter(filename => /^\d{4}_.+\.sql$/.test(filename))
            .map(filename => filename.replace(/\.sql$/, ''))
            .sort()

        const journal = JSON.parse(
            await readFile('server/db/migrations/meta/_journal.json', 'utf8'),
        )

        const tags = journal.entries.map((entry: { tag: string }) => entry.tag).sort()

        expect(tags).toEqual(files)
    })
})
