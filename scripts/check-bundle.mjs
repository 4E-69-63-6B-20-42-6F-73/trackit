import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const budgetBytes = 500 * 1024
const directory = join(process.cwd(), 'dist', 'assets')
const failures = []
for (const filename of await readdir(directory)) {
    if (!filename.endsWith('.js')) continue
    const bytes = (await stat(join(directory, filename))).size
    if (bytes > budgetBytes) failures.push(`${filename}: ${Math.ceil(bytes / 1024)} KiB`)
}
if (failures.length) {
    console.error(`JavaScript chunk budget exceeded (500 KiB):\n${failures.join('\n')}`)
    process.exit(1)
}
console.log('All production JavaScript chunks are within the 500 KiB budget.')
