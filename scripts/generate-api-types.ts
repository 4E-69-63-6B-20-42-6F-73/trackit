import { writeFile } from 'node:fs/promises'
import openapiTS, { astToString } from 'openapi-typescript'
import { format } from 'prettier'
import { createApp } from '../server/app.js'
import type { DataRepository } from '../server/data/types.js'
import type { JournalRepository } from '../server/journal/types.js'

const journal: JournalRepository = {
    list: async () => [],
    ready: async () => true,
}

const app = await createApp(journal, {
    dataRepository: {} as DataRepository,
})

try {
    await app.ready()
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' })
    if (response.statusCode !== 200) {
        throw new Error(`OpenAPI generation failed (${response.statusCode})`)
    }
    const ast = await openapiTS(response.json(), { silent: true })
    const source = await format(astToString(ast), {
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
}
