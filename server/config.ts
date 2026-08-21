import { z } from 'zod'

const configSchema = z.object({
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),
    DATABASE_URL: z.string().min(1),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    TRUST_PROXY: z
        .enum(['true', 'false'])
        .default('false')
        .transform(value => value === 'true'),
    BACKUPS_ENABLED: z
        .enum(['true', 'false'])
        .default('false')
        .transform(value => value === 'true'),
    BACKUP_DIR: z.string().default('./backups'),
    BACKUP_INTERVAL_HOURS: z.coerce.number().positive().default(24),
    BACKUP_ENCRYPTION_KEY: z.string().optional(),
    BOOTSTRAP_SECRET: z.string().min(32).optional(),
})

export const config = configSchema.parse({
    ...process.env,
    DATABASE_URL:
        process.env.DATABASE_URL ??
        (process.env.NODE_ENV === 'production'
            ? undefined
            : 'postgres://trackit:trackit@localhost:5432/trackit'),
})
