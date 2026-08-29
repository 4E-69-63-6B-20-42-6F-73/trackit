# TrackIt

TrackIt is a privacy-first, self-hosted health tracking application. It captures observations from
you and connected sources, then turns them into Today, Journal, Trends, and Goals.

The project is currently in alpha.

## Product model

```text
Capture
    Log observations
    Health Connect -> source records -> observations

Understand
    Today
    Journal
    Trends
    Goals

Library
    Foods
    Recipes
    Metric Center

Connections
    Health Connect / devices
    MCP

Settings
    Profile
    Data export / deletion
    Security
```

Observations are the canonical health facts. Journal, Today, Trends, daily metrics, and goal progress
are projections/read models. Foods, recipes, goals, metric definitions, and connection settings are
reference/configuration data.

## Development

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and configure the required values.

### Development database

Start PostgreSQL in Docker:

```bash
npm run dev:db
```

PostgreSQL is exposed only on localhost and uses port `5432` by default. The local API defaults to:

```text
postgres://trackit:trackit@localhost:5432/trackit
```

If port `5432` is already in use, choose another host port and update the database configuration.

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

`npm run dev` is currently an alias for `npm run dev:web`, so a typical local setup uses separate
terminals for `dev:db`, `dev:api`, and `dev:web`.

## Database migrations

TrackIt uses Drizzle Kit to generate and track PostgreSQL migrations. SQL migrations and Drizzle
metadata under `server/db/migrations/meta/` are one migration history and must be committed together.

For a normal schema change:

```text
edit server/db/schema.ts
        ↓
npm run db:generate -- --name=<descriptive_name>
        ↓
review generated SQL and metadata
        ↓
npm run db:check
        ↓
npm run check
        ↓
commit SQL + journal + snapshot
```

Do not manually create numbered migration SQL files. Drizzle snapshots are used to determine future
schema changes; hand-authored numbered migrations can leave the migration history inconsistent.

The API applies pending migrations during startup. Migrations can also be invoked explicitly with:

```bash
npm run db:migrate
```

## Project checks

Run the complete local validation suite with:

```bash
npm run check
```

This runs formatting, linting, migration consistency, secret scanning, unit tests, and the production
build. Pull-request CI additionally runs PostgreSQL integration/migration checks, Playwright E2E
coverage, container smoke/security checks, and Android validation.

Useful individual commands:

```bash
npm run format:check
npm run lint
npm run db:check
npm run test
npm run test:e2e
npm run build
npm run test:android
```

See `docs/METRIC_DATA_ARCHITECTURE.md` for the current observation/metric model and
`docs/DATA_EXPORT_AND_DELETION.md` for data-ownership behavior.
