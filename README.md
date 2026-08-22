# TrackIt

A privacy-first, self-hosted health and nutrition dashboard.

This is project is currently in ALPHA. The fundaments are there, but expect some friction here and there.

## Development

Install dependencies:

```bash
npm install
```

Dont forget create .env (See .env.example).

### Development database

Start PostgreSQL in Docker:

```bash
npm run dev:db
```

PostgreSQL is exposed only on localhost and uses port `5432` by default.

The local API defaults to:

```text
postgres://trackit:trackit@localhost:5432/trackit
```

If port `5432` is already in use, choose another host port:

```bash
POSTGRES_PORT=5433 npm run dev:db
```

and configure `DATABASE_URL` accordingly:

```bash
DATABASE_URL=postgres://trackit:trackit@localhost:5433/trackit npm run dev:api
```

### API

Start the API in watch mode:

```bash
npm run dev:api
```

Database migrations are applied when the server starts.

### Web app

Start the Vite development server:

```bash
npm run dev:web
```

`npm run dev` is an alias for `npm run dev:web`.

A typical local development setup therefore uses three terminals:

```bash
npm run dev:db
```

```bash
npm run dev:api
```

```bash
npm run dev:web
```

## Database migrations

Trackit uses Drizzle Kit to generate and track PostgreSQL migrations.

The migration directory contains both SQL migrations and Drizzle metadata:

```text
server/db/migrations/
├── 0000_....sql
├── 0001_....sql
└── meta/
    ├── _journal.json
    ├── 0000_snapshot.json
    └── 0001_snapshot.json
```

The files under `meta/` are part of the migration history and must be committed together with the SQL migrations.

### Creating a migration

First update:

```text
server/db/schema.ts
```

Then generate the migration:

```bash
npm run db:generate
```

To give the migration a descriptive name:

```bash
npm run db:generate -- --name=devices_configured_at
```

Commit all generated files, including:

- the generated `.sql` migration
- `meta/_journal.json`
- the generated `meta/*_snapshot.json`

Do not manually create numbered migration SQL files.

Drizzle Kit uses its snapshots to determine what changed between schema versions. A manually-created SQL migration may update the database correctly while leaving Drizzle's schema history unchanged. The next generated migration can then incorrectly contain changes that were already made by previous migrations.

### Checking migration consistency

Run:

```bash
npm run db:check
```

This validates the generated Drizzle migration metadata.

It is also included in the full project check:

```bash
npm run check
```

Run `npm run check` before opening a pull request.

### Applying migrations

The API applies pending migrations during startup, so normal development only requires:

```bash
npm run dev:api
```

Migrations can also be invoked explicitly with:

```bash
npm run db:migrate
```

### Migration workflow

For normal schema changes:

```text
edit server/db/schema.ts
        ↓
npm run db:generate
        ↓
review generated SQL
        ↓
npm run db:check
        ↓
npm run check
        ↓
commit SQL + journal + snapshot
```

Never commit a generated SQL migration without its corresponding Drizzle metadata.

## Project checks

Run the complete validation suite with:

```bash
npm run check
```

This checks:

1. formatting
2. linting
3. Drizzle migration consistency
4. committed secrets
5. tests
6. production build

Individual development commands are also available:

```bash
npm run format:check
npm run lint
npm run db:check
npm run test
npm run build
```
