import { spawnSync } from 'node:child_process'

const executable = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const result = spawnSync(executable, ['assembleDebug'], {
    cwd: 'android',
    stdio: 'inherit',
    shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
