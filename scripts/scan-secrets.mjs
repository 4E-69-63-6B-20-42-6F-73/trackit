import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const ignored = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    '.gradle',
    'coverage',
    'test-results',
])
const textExtensions = new Set([
    '.js',
    '.mjs',
    '.ts',
    '.tsx',
    '.json',
    '.md',
    '.yaml',
    '.yml',
    '.sql',
    '.kt',
    '.kts',
    '.xml',
    '.properties',
])
const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /AKIA[0-9A-Z]{16}/,
    /gh[ps]_[A-Za-z0-9]{30,}/,
    /xox[baprs]-[A-Za-z0-9-]{20,}/,
]
const findings = []

async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue
        const path = join(directory, entry.name)
        if (relative(root, path).replaceAll('\\', '/') === 'scripts/scan-secrets.mjs') continue
        if (entry.isDirectory()) {
            await scan(path)
        } else if (textExtensions.has(extname(entry.name))) {
            const content = await readFile(path, 'utf8')
            if (patterns.some(pattern => pattern.test(content))) findings.push(relative(root, path))
        }
    }
}

await scan(root)
if (findings.length) {
    process.stderr.write(`Potential secrets found:\n${findings.join('\n')}\n`)
    process.exit(1)
}
process.stdout.write('No high-confidence secrets found.\n')
