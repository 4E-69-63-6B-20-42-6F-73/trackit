import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    dialect: 'postgresql',
    schema: [
        './server/db/schema.ts',
        './server/planning/schema.ts',
        './server/nutrition/schema.ts',
    ],
    out: './server/db/migrations',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? 'postgres://trackit:trackit@localhost:5432/trackit',
    },
})
