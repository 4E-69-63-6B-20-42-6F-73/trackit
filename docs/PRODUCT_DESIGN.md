# TrackIt — Product and Experience Design

Status: proposed product direction, August 2026

## 1. Product definition

TrackIt is a privacy-first, self-hosted health and nutrition journal that turns fragmented daily records into a calm, understandable picture of a person's wellbeing.

It combines:

- health measurements imported from Android Health Connect;
- fast manual logging for meals, water, weight, symptoms, and notes;
- trends and correlations that always expose their underlying data;
- an opt-in MCP server for querying and logging data from compatible assistants;
- simple export, backup, and deletion controls.

TrackIt is a personal record and reflection tool, not a diagnostic product. It should never present a correlation or generated summary as medical advice.

### Product principles

1. Private by construction — one household installation, local storage, no telemetry by default.
2. Useful in ten seconds — today's state and the next useful action are immediately visible.
3. Honest about data — source, freshness, gaps, units, and confidence remain visible.
4. Calm, not compulsive — no shame, streak loss, red failure states, or manipulative notifications.
5. Accessible depth — simple defaults with detail available on demand.
6. Interoperable — explicit APIs, portable exports, and a narrow, auditable MCP surface.

## 2. Audience and primary jobs

### Primary user

A privacy-conscious self-hoster who wants to combine activity, sleep, body measurements, meals, and personal observations without sending the resulting longitudinal record to another SaaS platform.

### Jobs to be done

- “Show me how I am doing today without making me interpret six dashboards.”
- “Let me log a meal or measurement in a few seconds.”
- “Help me notice whether sleep, activity, food, and symptoms move together.”
- “Let me ask an assistant questions about my data while retaining control of access.”
- “Make it obvious where every value came from and let me correct or remove it.”

### Explicit non-goals for v1

- clinical diagnosis, treatment advice, or emergency monitoring;
- calorie estimates from meal photos;
- social feeds, leaderboards, or coaching marketplaces;
- direct integrations with every wearable vendor;
- family health administration beyond separate local accounts;
- iOS HealthKit sync (planned as a parallel companion later).

## 3. Information architecture

Desktop navigation uses a compact left rail. Mobile web uses a four-item bottom bar plus a contextual create button.

```text
Today
Journal
  Timeline
  Meals
  Measurements
Trends
  Explore
  Saved views
Connections
  Health Connect
  MCP
  Import / export
Settings
  Profile and units
  Goals
  Privacy and retention
  Backups
  System
```

Global actions: search, date switcher, quick add, sync state, profile.

## 4. Core experience

### 4.1 Onboarding

Keep onboarding resumable and under five screens:

1. Welcome: “Your health data, on your server.” Explain ownership in three short statements.
2. Profile: timezone, locale, preferred units, optional birth year/sex only where needed for a user-selected calculation.
3. Focus areas: energy, nutrition, sleep, movement, body metrics, or “just collect for now.” This configures the dashboard; it does not request data access.
4. Connect data: pair the Android companion with a one-time QR code, import a file, or skip.
5. Ready: show the populated Today screen or a useful empty state with one primary action.

Permissions are requested just in time and by category. Before Android opens the Health Connect permission sheet, TrackIt explains what it wants, why, whether it will write back, and how to revoke access.

### 4.2 Today

The default screen answers “What matters today?” rather than showing every metric.

```text
┌─────────────────────────────────────────────────────────────────┐
│ Thu, 20 Aug                    Synced 3 min ago     + Quick add  │
├──────────────────────────────────────┬──────────────────────────┤
│ Good afternoon                       │ Today                    │
│ Sleep was 42m longer than usual.     │ 7,240 steps     72%     │
│                                      │ 1.6 L water     67%     │
│ [Sleep 7h 38] [Resting HR 58]        │ Protein 84 g    74%     │
│ [Energy 7/10] [Weight —]             │                          │
├──────────────────────────────────────┴──────────────────────────┤
│ Timeline                                                        │
│ 08:10  Breakfast · 510 kcal · 28 g protein                      │
│ 09:02  Walk · 24 min · Health Connect                           │
│ 12:40  Energy check-in · 7/10                                   │
└─────────────────────────────────────────────────────────────────┘
```

- The lead insight is deterministic and dismissible. It compares against the person's own recent baseline.
- Metric cards show value, unit, compact trend, source/freshness on hover or focus, and missing-data states.
- Targets are optional. Progress uses neutral language (“1.6 of 2.4 L”), never “failed.”
- Quick add opens a command palette: meal, water, weight, blood pressure, symptom, mood/energy, note, or custom metric.

### 4.3 Fast food logging

The food flow optimizes repeat use:

1. Choose meal context automatically from local time, but allow one-tap change.
2. Search recent and favorite foods first, then the local food catalog.
3. Adjust amount inline with familiar household units or grams.
4. Review a compact meal summary and save.

Recipes are reusable ingredient groups with yield and serving size. Barcode lookup and external food databases are adapters, not requirements; manual entries always work offline in the web app. Nutrition totals visibly distinguish user-entered, database-derived, and calculated values.

### 4.4 Journal

One chronological stream combines imported and manual records. Filter chips cover source, category, and status. Adjacent related events can collapse into a session. Every row exposes provenance and supports inspect, edit (where owned), duplicate, and delete. Imported source records are corrected at their source unless the user explicitly creates a local override.

### 4.5 Trends

Start with questions instead of charts:

- “How has my sleep changed?”
- “What tends to happen after high-activity days?”
- “Compare protein and energy.”

The explorer supports one primary and one comparison metric, 7/30/90-day and custom ranges, daily/weekly aggregation, and annotations from the journal. It shows missing days rather than interpolating them. Correlation cards state sample size, lag, method, and “association is not causation.” Raw records remain one click away.

### 4.6 Connections and trust center

Every integration gets a card showing access, last successful sync, last error, data volume, and revoke action. A data-flow view answers “where does my data go?” at a glance:

```text
Health Connect on phone → encrypted connection → this TrackIt server
                                                ↘ optional MCP clients
```

The MCP card lists issued clients/tokens, granted capabilities, last use, and an access log. Token values are shown once.

## 5. Visual system

The visual direction is “quiet instrument panel”: warm neutral surfaces, restrained color, crisp typography, and generous space. Avoid the neon-on-black fitness aesthetic and medical-dashboard sterility.

- Type: system-first sans for UI; tabular numerals for measurements.
- Base: warm off-white in light mode and charcoal, not pure black, in dark mode.
- Accent: deep teal for navigation and selected state.
- Categories: sleep indigo, activity green, nutrition amber, body blue, subjective state violet.
- Status: color is never the only signal; icons and labels accompany it.
- Density: comfortable by default, with an optional compact table mode.
- Motion: 150–220 ms transitions; respect reduced-motion settings.
- Charts: direct labels where possible, keyboard-readable points, textual summaries, and patterns for comparisons.

Accessibility target: WCAG 2.2 AA. Minimum 44×44 px touch targets, visible focus, full keyboard navigation, semantic landmarks, locale-aware date/number formatting, and no information conveyed only by hover.

## 6. Google health integration decision

“Google Health” should mean Android Health Connect, not a new dependency on legacy Google Fit APIs.

Health Connect is an on-device datastore exposed through an Android SDK. Therefore, the web server cannot pull it directly. TrackIt needs a small Android companion application:

```text
Wearables / health apps
          ↓
Android Health Connect
          ↓ permissioned reads and change tokens
TrackIt Android companion
          ↓ paired HTTPS API, batched and resumable
Self-hosted TrackIt server
```

The companion should:

- pair through a short-lived QR code and device-bound credential;
- request only categories selected by the user;
- sync foreground-first, with optional background-read permission;
- maintain a separate change token per record type;
- batch uploads, retry safely, and deduplicate by source ID plus version;
- propagate source deletions and clearly report expired-token recovery;
- initially read only; writing back to Health Connect is a later, separate permission.

Initial record types: steps, exercise sessions, sleep sessions, heart rate/resting heart rate, weight, body fat, blood pressure, hydration, and nutrition where available. Store original source, device, zone offset, and raw metadata alongside normalized values.

Google Fit REST may remain a clearly labeled transitional import adapter only if real users need historical migration. It should not be the primary architecture.

## 7. MCP design

TrackIt exposes a remote MCP server as an optional service on the same origin (for example `/mcp`). It is disabled until the owner enables it.

### Resources

- `trackit://profile` — units, timezone, configured goals; excludes unnecessary identity fields.
- `trackit://metrics/catalog` — available metrics, units, date coverage, and sources.
- `trackit://days/{date}` — daily summary with completeness metadata.
- `trackit://reports/{id}` — explicitly saved reports.

### Read tools

- `get_daily_summary(date, categories?)`
- `query_measurements(metric, start, end, aggregation?)`
- `list_meals(start, end, meal_type?)`
- `get_nutrition_summary(start, end, grouping?)`
- `compare_metrics(primary, secondary, start, end, lag_days?)`
- `search_journal(query, start?, end?)`

### Write tools (separate grant)

- `log_measurement(type, value, unit, observed_at, note?)`
- `log_meal(name, eaten_at, items, note?)`
- `log_check_in(kind, value, observed_at, note?)`
- `delete_record(record_id, confirmation_token)`

Write calls return a preview and audit identifier. Destructive calls require a second, short-lived confirmation token. MCP must not expose diagnosis or recommendation tools in v1.

### Access model

- Per-client tokens with read-only default, category scopes, and optional date-range limits.
- Separate grants for sensitive categories and writes.
- Rate limits, token expiry, immediate revocation, and an immutable security audit log.
- Tool output minimizes data and includes timezone, unit, source coverage, and missing-data notes.
- No ambient access: enabling MCP alone issues no credential.

## 8. Technical architecture

Recommended monorepo:

```text
apps/web          responsive web UI and server-rendered shell
apps/server       REST API, jobs, MCP endpoint, authentication
apps/android      Health Connect companion
packages/domain   schemas, units, normalization, derived metrics
packages/ui       design system and chart primitives
packages/sdk      generated API clients
deploy            Docker Compose examples and reverse-proxy guidance
```

Recommended stack:

- Web: TypeScript, React, Next.js, Tailwind CSS, Radix-style accessible primitives, TanStack Query, and a chart library wrapped behind accessible domain components.
- Server: TypeScript with Fastify or NestJS; OpenAPI contract; official MCP TypeScript SDK.
- Data: PostgreSQL 17+, with ordinary partitioned time-series tables; Redis is optional, not required.
- Android: Kotlin, Jetpack Compose, WorkManager, Health Connect SDK.
- Deployment: one Docker image for web/API plus PostgreSQL; optional worker split for larger installations.

Keep business logic in the domain package rather than UI components or transport handlers. Store canonical SI-compatible values and the original value/unit. PostgreSQL is the source of truth; derived daily aggregates are reproducible caches.

### Service flow

```text
Web / Android / MCP client
          ↓ authenticated boundary
API + authorization policy
          ↓
domain services → PostgreSQL
          ↘ jobs: normalization, daily aggregates, backups
```

## 9. Core data model

- `users`: local identity, timezone, locale, unit preferences.
- `sources`: manual, Health Connect origin, import, MCP client.
- `observations`: typed scalar or interval measurement, canonical/original values, timestamps, provenance, version.
- `sessions`: sleep and exercise intervals with optional samples/routes.
- `foods`: user or catalog food with nutrients per basis quantity.
- `recipes`, `recipe_items`: reusable compositions and yields.
- `meals`, `meal_items`: consumed quantities and nutrient snapshots.
- `journal_entries`: notes, symptoms, mood, energy, and tags.
- `goals`: optional target/range/schedule with effective dates.
- `sync_devices`, `sync_cursors`, `external_records`: pairing, per-type cursor, and dedupe/deletion mapping.
- `mcp_clients`, `access_grants`, `audit_events`: scoped machine access and traceability.

All mutable health records use stable UUIDs, `created_at`, `updated_at`, optional `deleted_at`, and optimistic versions. Never overwrite provenance. Route/GPS data is a separately granted category.

## 10. Security, privacy, and operations

- Local accounts with passkeys first; password fallback supported. OIDC is optional for advanced installs.
- HTTPS required outside loopback; secure cookies, CSRF protection, strict CSP, and no third-party scripts.
- Field-level application encryption for refresh tokens and device credentials; deployment secret supplied externally.
- Audit authentication, exports, permission changes, sync devices, MCP access, and destructive actions—never secrets or raw meal notes in logs.
- Configurable retention by data category; export and deletion are first-class UI flows.
- Export: versioned JSON plus CSV; later FHIR export for compatible clinical observations.
- Encrypted, restorable backups with a UI that reports last verified backup, not merely last attempted backup.
- No telemetry by default. Optional diagnostics must be scrubbed and previewable.

The deployment documentation must clearly state that self-hosting changes who operates the system but does not eliminate the need for backups, TLS, patching, and jurisdiction-specific privacy compliance.

## 11. Empty, loading, and error states

- Empty states explain the value and offer one action; they never resemble broken charts.
- Skeletons preserve layout but do not imitate real health values.
- Stale imported values remain visible with a “last synced” label.
- Partial sync reports which categories completed and offers retry.
- Unit conflicts are normalized but retain the original reading.
- Suspicious outliers are shown, not silently deleted; users can mark them excluded from aggregates.
- Offline web changes queue locally and visibly reconcile; conflicts are presented in human terms.

## 12. Delivery plan

### Phase 0 — validation and interaction prototype (1–2 weeks)

- Test Today, quick add, meal logging, and trend exploration with 5–8 target users.
- Validate the Android companion expectation and the first five Health Connect categories.
- Produce high-fidelity responsive prototypes and a clickable permissions flow.
- Decide whether the first release is single-user only (recommended).

Exit: users can complete the four critical tasks without guidance, and scope is frozen.

### Phase 1 — private alpha foundation (4–6 weeks)

- Local auth, profile/units, responsive shell, design system.
- Manual measurements, check-ins, meals, recipes, Today, and journal.
- PostgreSQL schema, audit events, JSON/CSV export, Docker Compose, backup job.
- Deterministic daily summaries; no AI-generated health claims.

Exit: a user can run TrackIt, log a week of data, restore a backup, and export everything.

### Phase 2 — Health Connect sync (4–6 weeks)

- Android pairing, per-category permissions, initial import, incremental sync, deletion propagation.
- Connection health, provenance display, retry/recovery, and sync diagnostics.
- Steps, sleep, weight, heart rate, and exercise first; add other types after reliability testing.

Exit: seven days of repeated sync produces no duplicates and survives revoked permissions, expired cursors, time-zone changes, and intermittent network.

### Phase 3 — trends and MCP (3–5 weeks)

- Trend explorer, saved views, completeness and correlation explanations.
- Read-only MCP resources/tools, scoped credentials, access log, revocation, rate limits.
- Add MCP writes only after read access has had a security review.

Exit: MCP clients can answer bounded questions with traceable data, and all access appears in the UI audit log.

### Phase 4 — hardening and release

- Accessibility and keyboard audit, threat model, dependency and container scanning.
- Large-history performance tests, restore drills, migration tests, documentation.
- Optional passkeys/OIDC refinements and multi-user isolation review.

## 13. Success measures

- Median manual measurement entry under 8 seconds.
- Median repeated meal entry under 20 seconds.
- Today screen's key state understandable in a 5-second usability test.
- Health Connect duplicate rate: zero in reliability suite.
- Every displayed value can reveal source and timestamp within one interaction.
- 100% of MCP calls attributable to a client, grant, and audit event.
- WCAG 2.2 AA automated checks plus manual keyboard/screen-reader acceptance.
- Backup restore succeeds in a clean environment as part of every release candidate.

## 14. Decisions to settle before implementation

1. Single-user first, or multiple isolated household accounts? Recommendation: single-user first, with tenant-safe schema boundaries.
2. Is an Android companion acceptable as the Health Connect bridge? Recommendation: yes; do not promise browser-only Google health sync.
3. Which five imported categories matter most to the first users? Proposed: steps, sleep, weight, heart rate, and exercise.
4. Should nutrition begin with manual/local foods only, or ship with an external food catalog adapter? Recommendation: local-first with an optional adapter.
5. Should MCP ship read-only initially? Recommendation: yes, then add separately scoped writes after review.

