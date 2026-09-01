import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { format } from 'prettier'
import { createApp } from '../server/app.js'
import type { DataRepository } from '../server/data/types.js'
import type { JournalRepository } from '../server/journal/types.js'

const execFileAsync = promisify(execFile)
const journal: JournalRepository = {
    list: async () => [],
    ready: async () => true,
}
const root = fileURLToPath(new URL('..', import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 'trackit-openapi-'))
const input = join(directory, 'openapi.json')
const output = join(directory, 'api.generated.ts')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const app = await createApp(journal, {
    dataRepository: {} as DataRepository,
})

try {
    await app.ready()
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' })
    if (response.statusCode !== 200) {
        throw new Error(`OpenAPI generation failed (${response.statusCode})`)
    }
    await writeFile(input, JSON.stringify(response.json()))
    await execFileAsync(
        npm,
        [
            'exec',
            '--yes',
            '--package=openapi-typescript@7.13.0',
            '--package=typescript@5.9.3',
            '--',
            'openapi-typescript',
            input,
            '-o',
            output,
        ],
        { cwd: root },
    )
    const generated = await readFile(output, 'utf8')
    const source = await format(generated, {
        parser: 'typescript',
        printWidth: 100,
        tabWidth: 4,
        useTabs: false,
        semi: false,
        singleQuote: true,
        trailingComma: 'all',
        arrowParens: 'avoid',
    })
    await writeFile(new URL('../src/lib/api.generated.ts', import.meta.url), source)
} finally {
    await app.close()
    await rm(directory, { recursive: true, force: true })
}
