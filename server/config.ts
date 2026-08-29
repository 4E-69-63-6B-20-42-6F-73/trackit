import { z } from 'zod'

const configSchema = z.object({
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    TRUST_PROXY: z
        .enum(['true', 'false'])
        .default('false')
        .transform(value => value === 'true'),
    API_RATE_LIMIT_MAX: z.coerce.number().int().min(60).max(10_000).default(600),
    BOOTSTRAP_SECRET: z.string().min(32).optional(),
    TRACKIT_DB_HOST: z.string().default(process.env.NODE_ENV === 'production' ? 'db' : 'localhost'),
    TRACKIT_DB_PORT: z.coerce.number().int().positive().default(5432),
    TRACKIT_DB_PASSWORD: z.string().default(''),
    FOOD_CATALOG_URL: z.preprocess(
        value => (value === '' ? undefined : value),
        z.string().url().optional(),
    ),
})

const parsed = configSchema.parse(process.env)

export const config = {
    ...parsed,
    DATABASE_URL: `postgres://trackit:${encodeURIComponent(parsed.TRACKIT_DB_PASSWORD)}@${parsed.TRACKIT_DB_HOST}:${parsed.TRACKIT_DB_PORT}/trackit`,
}
