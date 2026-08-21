import { readFile, readdir } from 'node:fs/promises'

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
