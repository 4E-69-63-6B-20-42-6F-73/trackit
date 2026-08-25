# TrackIt final system review

Review date: 2026-08-25  
Status: remediation implemented; production validation in progress
Scope: web application, API, PostgreSQL model, effective metric pipeline, Android ingestion boundary, deployment, operations, developer workflow, accessibility, and core user journeys

## Executive assessment

TrackIt has a strong foundation for a privacy-first, single-owner health product. The central metric registry, canonical units, provider-aware effective series, generalized goals, transactional writes, authentication, encrypted backups, and broad automated test coverage are the right architectural choices. The application is no longer a collection of page-specific health calculations: effective observations and goal evaluation now have identifiable domain boundaries.

The system is suitable for continued alpha use, but it should not be called operationally complete yet. There are no identified P0 issues that require taking the service offline. The nine implementation findings selected after this review have been remediated; backup/restore hardening remains the open P1 operational item.

### Remediation status

| Finding                     | Resolution                                                                                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 time boundaries       | Effective observation, meal, and journal reads now use half-open instant ranges, with midnight regression coverage.                                                                                                                             |
| P1-02 lifecycle projections | Observation/meal retention and category deletion now mark affected owner-local dates dirty.                                                                                                                                                     |
| P1-03 Today goal math       | Today uses server goal evaluations and limits percentage bars to daily cumulative GTE goals.                                                                                                                                                    |
| P1-04 migration history     | A current `0011` Drizzle snapshot is committed; a no-change generation check succeeds and CI checks drift.                                                                                                                                      |
| P1-05 runtime packaging     | The server and shared domain modules compile to JavaScript; the final image has no application TypeScript or runtime `tsx`.                                                                                                                     |
| P1-06 deployment assets     | Builds happen before activation, activation waits for readiness, recent hashed assets persist across releases, and obsolete lazy imports perform one guarded reload. The documented proxy retry window covers short safe-read replacement gaps. |
| P1-08 materialization state | Completed and dirty projection tables distinguish empty, stale, partial, and pending dates.                                                                                                                                                     |
| P1-09 ingestion latency     | Device uploads commit raw data plus coalesced dirty dates; a durable worker performs projection rebuilding afterward.                                                                                                                           |
| P1-10 mobile hierarchy      | Existing goals precede creation on mobile, narrow metric cards become one column, reflection actions reflow, and navigation uses safe-area padding.                                                                                             |

### Production validation — 2026-08-25

A read-only investigation of the live VM, application container, and PostgreSQL database found:

- Health and database-backed readiness were healthy. The application used about 56 MiB and PostgreSQL about 139 MiB at rest.
- The database contained roughly 216,000 canonical Health Connect records and 690,000 projected observations. Exact external-identity duplicate checks returned zero duplicate groups.
- The configured Steps policy included only Google Fit. Effective-series and daily-projection totals agreed: 4,816 for 25 August and 13,531 for 24 August. Fitbit was excluded and reported 8,330 raw steps on 24 August. The reported “14,000” was therefore the selected provider's total, not a sum across enabled and disabled providers.
- A 30-day daily-metrics request started a synchronous historical materialization backfill and did not finish before the application restarted. Reads now return existing history, rebuild at most the active day inline, and queue historical dates for the projection worker.
- Input-date discovery previously transferred every matching observation timestamp into Node.js. It now asks PostgreSQL only for distinct owner-local dates.
- 6,579 Health Connect envelopes legitimately used an epoch placeholder while their projected observations had real sample timestamps. Invalidation incorrectly used the envelope timestamp, creating empty 1969/1970 materialization markers. Invalidation now derives dates from affected projected observations.
- Missing hashed assets were rewritten to `index.html` with status 200. Asset misses now return 404 so guarded client recovery can run, and content-addressed assets receive immutable cache headers.
- Production preferences use `UTC`, while the browser requested Europe/Amsterdam-style day bounds. Today now derives detail boundaries from the saved preference timezone so details and projections use the same calendar day. The owner should explicitly select `Europe/Amsterdam` if that is the intended product timezone.
- The applied migration count is correct: 12 journal rows represent migrations `0000` through `0011`.

### Scorecard

| Area                 | Assessment              | Summary                                                                                                                               |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Domain architecture  | Good                    | Registry, canonical units, goal engine, and effective-series separation are sound.                                                    |
| Data correctness     | Needs targeted work     | Effective resolution is centralized, but range endpoints and lifecycle invalidation have correctness gaps.                            |
| Data efficiency      | Good for one owner      | Bounded reads and daily projections help; sync rebuilds and high-frequency series still scale in application memory.                  |
| API design           | Adequate                | Validation and security are solid, but `server/app.ts` is too broad and contracts are duplicated manually.                            |
| Deployment           | Needs work              | Secure defaults are good; runtime packaging and single-instance upgrades explain avoidable production 502/chunk failures.             |
| Operability          | Needs work              | Health/readiness and backups exist, but restore verification, shutdown, telemetry, and off-host backup guarantees need strengthening. |
| Developer ergonomics | Needs work              | Tests and scripts are broad, but the documented all-in-one check currently fails formatting and migration metadata is incomplete.     |
| Desktop UX           | Good                    | Clear hierarchy, consistent surfaces, and focused Metrics/Goals interactions.                                                         |
| Mobile UX            | Mixed                   | Navigation is understandable, but dense two-column cards truncate meaning and long creation forms bury existing content.              |
| Accessibility        | Good automated baseline | Native controls, labels, focus states, and axe coverage are present; manual assistive-technology validation remains outstanding.      |

## Review method and evidence

This review used:

- repository and dependency structure;
- Fastify routes, validation, authentication boundary, and error handling;
- Drizzle schema and every database migration;
- observation ingestion, exact deduplication, overlap resolution, derived metrics, and daily projections;
- Today, Goals, Trends, Metrics, Nutrition, Journal, Settings, Connections, MCP, and Android-facing paths;
- Dockerfile, Compose, deployment scripts, backup/restore logic, operations documentation, and CI workflows;
- component, domain, API, integration, security, accessibility, performance, and Playwright test structure;
- current desktop and mobile review screenshots in `docs/ui-screenshots`.

The production build, schema check, lint, and unit/integration suite passed immediately before this review. The focused metric-flow regression suite also passed. `docker compose config --quiet` succeeds. A live production VM, reverse proxy, application container, and PostgreSQL database were subsequently inspected as summarized above. Restore into an independent host, a live Android upload trace, and manual screen-reader validation remain outstanding operational acceptance work.

## Target architecture and current flow

```text
Android / manual logging / meals
              |
              v
Raw immutable health records and observations
              |
              v
Exact external-identity deduplication
              |
              v
Provider-aware overlap resolution
              |
              v
Metric source policy and priority
              |
              v
Effective canonical series + meal nutrient series
              |
              v
System-derived metrics (BMI, calorie balance)
              |
        +-----+-------------------+
        |                         |
        v                         v
Versioned daily projection   Bounded detail queries
        |                         |
        +----------+--------------+
                   v
         Today / Goals / Trends / MCP
```

This is the correct conceptual architecture. Raw records remain available for export and lifecycle operations, while normal product consumers use resolved effective data. The remaining work is primarily about making every mutation invalidate the correct projections, making time semantics identical across consumers, and improving operational packaging.

## Prioritized findings

### P1-01 — Standardize every time range as half-open `[from, to)`

**Evidence**

- Observation and meal repository filters use `<= to`.
- Today and Nutrition send the next local midnight as `to`.
- Daily projection code separately subtracts one millisecond from the next boundary.
- Trends mixes UTC date construction with owner-timezone daily projections.

An observation exactly at midnight can therefore contribute to both adjacent day queries. DST transitions also make scattered client-side boundary construction risky.

**Action**

1. Define a shared `MetricTimeRange` contract where `from` is inclusive and `to` is exclusive.
2. Use `gte(from)` and `lt(to)` in observations, meals, journals, MCP grants, and goal windows.
3. Let the server derive UTC instants from `{ localDate, timezone }` for calendar-day consumers.
4. Remove all `23:59:59.999` and `-1 ms` conventions.

**Acceptance tests**

- A record at exactly `2026-08-26T00:00` belongs to 26 August only.
- Amsterdam DST-start and DST-end days contain the expected records once.
- Today, Nutrition, Journal, Trends, Goals, and MCP return identical membership for the same range.

### P1-02 — Invalidate or rebuild nutrition projections during lifecycle deletion

**Evidence**

Normal meal create/update/delete paths rebuild their affected daily projection. Retention and category deletion remove meals directly in `DataLifecycleService`, but do not rebuild or delete the corresponding `daily_metrics` rows. Today and Trends can consequently show nutrients or calorie balance from deleted meals.

**Action**

- Before bulk meal deletion, collect affected owner-local dates.
- In the same transaction, either atomically replace those projections or delete them and enqueue/version them for bounded repair.
- Make every data mutation use one projection-invalidation service rather than calling projection code selectively.

**Acceptance tests**

- Applying meal retention removes calories, macros, and calorie balance from effective daily rows.
- Deleting the Meals category immediately removes those values from Today and Trends.
- Raw observation projections on the same day remain intact.

### P1-03 — Remove legacy goal math from Today

**Evidence**

The Goals page evaluates generalized goals centrally. Today still selects a goal by metric, extracts only a single target value, calculates `current / target`, and labels the section as daily totals. This is correct only for a daily `gte` total. It is misleading for `lte`, `between`, `average`, `latest`, weekly, and rolling goals.

**Action**

- Consume the same server goal-evaluation DTO used by the Goals page.
- Render a progress bar only for compatible cumulative `gte` goals.
- For `lte` and `between`, show current value, target/range, and neutral status copy.
- If Today is intentionally limited, filter to supported daily-total goals and link other goal types to Goals instead of approximating them.

**Acceptance tests**

- `Weight 7-day average <= 80 kg` never renders as a percentage bar.
- `Steps daily total >= 10,000` retains useful cumulative progress.
- Targets use the current per-metric display unit without changing canonical persistence.

### P1-04 — Restore migration metadata discipline

**Evidence**

The README requires a SQL migration, journal update, and Drizzle snapshot to be committed together and warns against manually numbered SQL. Snapshot history currently stops at `0003`, while migrations continue through `0010`. `drizzle-kit check` passes, but the repository's documented generation workflow and actual history no longer match. A future generated migration can rediscover old schema changes or produce a misleading diff.

**Action**

1. Establish a clean database at the current migration head.
2. Reconcile the Drizzle snapshot/history using a reviewed baseline or supported introspection workflow.
3. Add CI that generates a migration from the checked-in schema and fails if it is non-empty.
4. Replace the README's absolute rule with the exact workflow the project actually supports.

**Acceptance tests**

- Generating a migration without schema changes produces no SQL.
- A clean install and an upgrade from the last released schema produce identical schema fingerprints.

### P1-05 — Compile the server and package one deterministic runtime artifact

**Evidence**

The runtime container executes TypeScript through `tsx`. The Dockerfile manually copies selected `src/domain/*.ts` files because server modules import client-domain source. This already caused a production `ERR_MODULE_NOT_FOUND` when one required file was omitted. Every new cross-boundary import can recreate the failure even when local TypeScript and Vite builds pass.

**Action**

- Move shared domain code into a buildable package/module with an explicit public API.
- Emit server JavaScript during build and run Node against compiled output.
- Copy the compiled server tree and production dependencies as a unit; do not maintain a handwritten file allowlist.
- Add a CI smoke test that starts the final container and exercises readiness plus one route importing each domain service.

**Acceptance tests**

- The runtime image contains no application `.ts` files or `tsx` runtime dependency.
- Container startup and Goals, Metrics, Trends, and daily-metrics routes work from the built image.

### P1-06 — Make deployments asset-safe and rollback-aware

**Evidence**

The deployment script performs an in-place `docker compose up -d --build` for a single app instance. During replacement, the reverse proxy can receive 502 responses. A browser holding old HTML can request a hashed lazy chunk removed by the new image, producing a dynamic-import failure. These failure modes match the observed production errors involving assets and API 502 responses.

**Action**

- Deploy an immutable, versioned image rather than building production source in place.
- Use blue/green or a temporary second app instance, wait for `/api/ready`, then switch proxy traffic.
- Retain at least the previous static asset set for a grace period, or serve assets from a versioned immutable location.
- Add a client-level lazy-import recovery that performs one controlled reload when a chunk is obsolete.
- Record the running version/commit in `/api/health` and logs.

**Acceptance tests**

- Repeated API and lazy-route requests return no 502 during an upgrade.
- A browser loaded before deployment can still open a lazy route afterward.
- A failed readiness check leaves the previous version serving traffic.

### P1-07 — Re-enable routine restore verification and require off-host backups

**Evidence**

The normal verification workflow comments out the backup/restore drill while operations documentation describes it as a support condition. The release-tag workflow runs a restore drill, but routine changes can break recovery long before a tag. Compose stores encrypted backups in a Docker volume on the same host as PostgreSQL; encryption protects confidentiality but does not provide disaster recovery.

**Action**

- Re-enable a small clean-restore drill in normal CI; retain the five-year fixture for nightly or release CI if duration is the concern.
- Add an off-host destination and expose last successful upload and restore-verification timestamps.
- Alert visibly when scheduled backup creation fails; do not swallow timer errors silently.
- Document recovery time and recovery point objectives.

**Acceptance tests**

- Every main-branch build restores a representative encrypted archive into an empty database.
- Loss of the Docker host still leaves a restorable backup and separately held key.
- Settings reports overdue, failed, and never-verified backups.

### P1-08 — Introduce explicit projection materialization state

**Evidence**

Projection freshness is inferred only from rows that exist. A genuinely empty day has no row proving it was built, and a partially populated date cannot prove which metric set or dependency graph was evaluated. When a query returns no rows, repository code scans raw timestamps and may repeat work; when some rows exist, an accidentally missing metric is not detectable.

**Action**

- Add a `daily_projection_runs` record keyed by owner and local date with derivation version, resolution/dependency version, timezone, completion time, and status.
- Replace a date's rows and mark completion atomically.
- Treat rows as disposable output and the run marker as the materialization contract.

**Acceptance tests**

- An empty day is rebuilt once, not on every read.
- A failed rebuild leaves the previous completed projection or a clearly stale marker, never a partial current state.
- Adding a new derived metric causes affected dates to rematerialize.

### P1-09 — Decouple ingestion commits from per-day projection rebuild latency

**Evidence**

Device ingestion rebuilds each affected date sequentially in the upload transaction. Each rebuild resolves all effective metrics and meals for that day. Historical imports or high-frequency records can hold a transaction and locks for many dates, increase upload latency, and make projection computation part of the durability path.

**Action**

- Commit idempotent raw ingestion first.
- Write unique dirty projection keys in the same transaction.
- Process dirty dates with a bounded, retryable worker and coalesce repeated keys.
- Let reads use the last complete projection with a freshness indicator or perform a narrowly bounded synchronous repair when required.

**Acceptance tests**

- A five-year import has bounded request time and does not rebuild the same date repeatedly.
- Worker failure does not roll back raw records.
- Retried work is idempotent and observable.

### P1-10 — Repair mobile information hierarchy on Today and Goals

**Evidence**

Current mobile screenshots show four Today metric cards in two narrow columns. Secondary copy truncates, including the reason a reading is missing. The weekly reflection card wraps into a tall, fragmented layout. Goals places the entire creation form before existing goals, making review/edit/delete journeys require a long scroll; the fixed bottom navigation visually intersects long-form screenshots and increases perceived obstruction.

**Action**

- Use a one-column compact metric list below approximately 420 px, or hide nonessential secondary copy behind a clear action.
- Reflow the weekly reflection into title/copy followed by a full-width action row.
- When goals exist, lead with `Your goals` and open creation through a prominent Add goal action; preserve the current inline form for the empty state.
- Add safe-area-aware bottom padding based on navigation height and test sticky controls against the bottom navigation.

**Acceptance tests**

- At 320 and 375 CSS pixels, no meaningful status copy is clipped.
- Existing goal status/edit/delete is reachable before the creation form.
- The schedule, submit action, dialogs, and final page content are never obscured by navigation.

## P2 findings — schedule after the P1 release block

### P2-01 — Bound and validate daily-metrics requests

`/api/daily-metrics` accepts an entirely optional range and the repository will return all rows when omitted. Require both dates for interactive calls, enforce `from <= to`, cap the window, and create a separate privileged rebuild/export path for long histories.

### P2-02 — Make projection invalidation metric-specific

One global `metricResolutionVersion` invalidates every metric row when a single metric's source preference changes. Store a stable resolution hash/version per metric, and propagate invalidation through the derived-metric dependency graph. Disabling a Steps source should not force Weight or nutrition rematerialization.

### P2-03 — Push high-volume aggregation closer to PostgreSQL

The effective service materializes all bounded rows in Node and performs overlap resolution and derivation in memory. This is acceptable at current scale but expensive for heart-rate samples and 366-day API windows. Add query budgets and telemetry first, then use SQL/window aggregation or pre-resolved daily/hourly projections for high-frequency metrics. Preserve raw-detail endpoints for inspection.

### P2-04 — Remove the fixed 31-day assumption from goal evaluation

The goal-evaluation route derives its read window with a hard-coded 31 days. It covers the current 7/14/30-day model but duplicates domain knowledge. Ask the goal engine for the earliest required boundary across active goals so adding a period cannot silently create incomplete evaluations.

### P2-05 — Replace browser-global events with a typed query cache

State synchronization currently relies on stringly typed `window` events and module-global in-flight promises. This is lightweight but makes dependencies, retries, invalidation, and partial errors difficult to reason about. Adopt a small typed query/mutation layer with stable keys, abort support, stale times, and targeted invalidation.

### P2-06 — Preserve independent loading/error states

`ServerDataProvider` combines preferences and goals into one `unavailable` flag; later success from either refresh can clear a failure from the other. Model each resource independently and let screens degrade locally. Provide retry actions rather than relying on page reloads.

### P2-07 — Eliminate application-side catalog scans and recipe N+1 reads

Food search currently loads the full catalog and scores it in Node. Recipe listing queries items once per recipe. Move search normalization/ranking into indexed PostgreSQL queries and fetch recipe/item/food data in a single join grouped in memory.

### P2-08 — Modularize the API composition root

`server/app.ts` owns authentication, backups, lifecycle, MCP, devices, journal, metrics, nutrition, goals, and trends in one large module. Split route plugins by bounded context, keep common auth/error/schema helpers explicit, and integration-test the assembled application. This reduces merge conflicts and makes ownership clearer without creating microservices.

### P2-09 — Generate API documentation from executable schemas

The OpenAPI contract is maintained separately from Zod route schemas, so drift is likely. Register schemas with routes and generate OpenAPI from the same definitions. Add response schemas for effective observations, goal evaluations, and error envelopes.

### P2-10 — Add graceful shutdown and dependency-aware health

The process does not visibly stop lifecycle/backup timers or close the PostgreSQL pool on SIGTERM. `/api/health` is process-only while Compose uses it for container health. Add shutdown hooks, use liveness for process health, readiness for database/migration state, and configure orchestration/proxy checks accordingly.

### P2-11 — Improve background-job observability

Retention writes directly to `console.error`; scheduled backup failures are swallowed; projection repairs do not expose duration, rows, or freshness. Use structured application logging with job name, run ID, duration, affected dates/rows, and outcome. Add counters for raw/effective counts, dedup exclusions, rebuild queue depth, API latency, and database pool saturation without logging health values.

### P2-12 — Normalize provider identity when scale warrants it

Provider and connector are first-class columns on health records but are also recovered from observation JSON metadata. Expression indexes mitigate current reads, but schema-level fields would improve validation and query clarity. Plan a backward-compatible normalization only when query volume or multi-owner support justifies it.

### P2-13 — Make preference version increments concurrency-safe

Preference updates read the current resolution version and then write `current + 1`. Two tabs can lose an increment. Use an atomic SQL increment or compare-and-swap version, and merge metric preferences intentionally rather than relying on last-write-wins.

### P2-14 — Correct the developer quality gate immediately

Forty-seven tracked files currently fail Prettier, so `npm run check` and routine CI fail before reaching substantive validation. Apply one isolated formatting-only commit, add editor/CI consistency for line endings, and keep functional changes separate. Afterward, require the complete command locally and in pull requests.

### P2-15 — Strengthen manual accessibility validation

Automated axe coverage is a strong baseline but cannot verify announcements, focus order in complex dialogs, chart alternatives, or screen-reader comprehension of source priority. Record NVDA/Chrome and VoiceOver/Safari journeys for setup, logging, source disabling/reordering, goal creation, goal status, deletion, and recovery.

## User-journey review

### Setup and first run

**What works**

- Owner setup is protected by a high-entropy bootstrap secret.
- HTTPS, passkey, recovery, and proxy requirements are documented.
- Onboarding and connection entry points exist.

**Issues/actions**

- The deployment script prints the bootstrap secret to terminal output. Treat it as a one-time secret, avoid persistent CI logs, and explicitly rotate/remove it after setup.
- Add a post-setup checklist: save recovery codes, register a passkey, connect Android, verify first sync, configure off-host backup, and perform restore verification.
- Surface server version and effective timezone in Settings diagnostics.

### Connect and sync Health Connect

**What works**

- Provider and connector remain distinct.
- Upload batches and external identities are idempotent.
- Source policy is metric-specific and raw records are retained.

**Issues/actions**

- Explain the difference between `Keep all` and `Prefer higher-priority source` with a concrete example in the source dialog.
- After saving source changes, show a short recalculation state and last-applied timestamp; immediate silent lazy repair can otherwise make changed totals look unreliable.
- Expose counts such as “2 included, 1 excluded” without exposing fingerprints or low-level record concepts.

### Review Today

**What works**

- Clear greeting, next action, honest missing-data states, and direct logging affordance.
- Daily history uses compact projections while selected-day detail uses effective observations.

**Issues/actions**

- Resolve P1-03 before showing generalized goals here.
- Resolve mobile truncation and weekly-reflection reflow.
- Use owner-timezone server day boundaries rather than browser-local boundaries.
- If data is recalculating, distinguish “updating” from “no data.”

### Log and edit nutrition

**What works**

- Meal snapshots preserve historical nutrition when foods later change.
- Food, recipe, barcode/catalog, quick logging, editing, and journal linking form a coherent journey.

**Issues/actions**

- Make meal deletion discoverable from the meal surface; currently deletion is primarily mediated through a linked Journal entry.
- Ensure bulk lifecycle deletion invalidates projections.
- Preserve independent partial errors when catalog search fails but local foods remain available.

### Configure Metrics and sources

**What works**

- Compact category rows, friendly units, full-row interaction, presets-as-state, and per-metric source controls are clear.
- The source dialog separates inclusion, priority, and overlap policy without exposing implementation terms.

**Issues/actions**

- Disable or visually de-emphasize priority arrows while `Keep all` is selected, since the explanatory copy says priority is unused.
- Add an explicit unsaved-change guard if closing the modal discards source toggles or ordering.
- Announce recalculation status after save and retain focus on the edited row when the modal closes.

### Create, evaluate, edit, retire, and delete goals

**What works**

- Metric capabilities drive valid aggregation/comparator/period choices.
- Target and unit are visually separated; ranges, timing defaults, custom schedules, edit, retire, and retired deletion exist.
- Goals use centralized canonical evaluation and friendly no-data states.

**Issues/actions**

- On mobile, prioritize existing goals once any exist; creation should become an intentional action rather than permanent first content.
- Give an upcoming/expired/scheduled-off reason alongside inactive status.
- Avoid refetching all evaluations after a mutation if the server can return the updated evaluation with the mutation response.
- Make Today consume these same evaluations.

### Explore Trends

**What works**

- Metric discovery uses compact projections and detail queries are bounded to the selected range and metrics.
- Empty, low-coverage, comparison, inspection, and exclusion paths are considered.

**Issues/actions**

- Do not show the global “no trends” empty state merely because the selected metric has no observations when other discovered metrics do; offer another available metric.
- Build range boundaries in the owner timezone and use half-open semantics.
- Keep exclusion provenance and effective recalculation visible so a user understands why a chart changed.

### Privacy, export, retention, backup, and deletion

**What works**

- Raw export is an explicit internal path, retention is configurable, destructive actions are confirmed, backups are encrypted, and audit records exist.

**Issues/actions**

- Treat projection invalidation as part of every lifecycle operation.
- Verify export clearly distinguishes raw observations, effective projections, preferences, and derived values.
- Do not imply a same-host backup is disaster recovery.
- Make irreversible owner deletion explain that local backups may still contain data and provide a purge/export sequence.

## Architecture strengths to preserve

- Keep the metric registry independent of React.
- Keep canonical persistence separate from display preferences.
- Keep raw records immutable/retained while effective resolution is policy-driven.
- Keep connector and provider separate.
- Keep exact external identity dedup automatic and non-configurable.
- Keep derived metrics computed from effective inputs.
- Keep goal validation/evaluation outside presentation.
- Keep one modular monolith and one PostgreSQL database for the current product; the findings do not justify microservices.
- Keep destructive lifecycle operations transactional.
- Keep privacy-sensitive values out of operational telemetry.

## Recommended delivery sequence

### Release-hardening sprint

1. Fix half-open time ranges and owner-timezone boundary APIs.
2. Fix meal lifecycle projection invalidation.
3. Replace Today's legacy goal rendering.
4. Repair migration snapshots and make generation drift a CI failure.
5. Apply the isolated formatting baseline so `npm run check` is green.
6. Compile/package the server deterministically and add final-image smoke tests.

### Operations sprint

1. Implement asset-safe deployment with readiness and rollback.
2. Re-enable routine restore tests and configure off-host backups.
3. Add graceful shutdown and structured background-job telemetry.
4. Add projection-run state and dirty-date processing.

### Product-quality sprint

1. Rework Goals and Today mobile hierarchy.
2. Add source-policy recalculation feedback and clearer policy examples.
3. Unify client server-state management and partial error/retry behavior.
4. Complete NVDA and VoiceOver journey testing.

### Scale-triggered work, not immediate work

- SQL/window-based effective resolution for high-frequency metrics.
- Metric-specific projection dependency versions.
- Indexed food search and batched recipe reads.
- Normalized observation provider/connector columns.
- Multi-owner tenancy, only if product scope changes.

## Potential product and platform improvements

These are optional opportunities, not remediation requirements:

- A compact data-quality panel per metric: last update, included sources, excluded count, and recalculation freshness.
- A read-only “Why this value?” explanation that summarizes source policy without exposing low-level fingerprints.
- A projection/backfill diagnostics command for operators with dry-run, bounded date range, and progress output.
- A client build/version mismatch banner that offers a safe refresh after deployment.
- Contract tests shared by web, server, MCP, and Android for unit IDs, metric IDs, weekday numbering, and half-open range semantics.
- Performance budgets based on representative records per metric, not only JavaScript bundle size.
- A sanitized support bundle containing versions, configuration presence, job status, and counts—never raw health values.

## Definition of release readiness

TrackIt is ready to move from alpha toward stable when:

- every P1 item above is resolved or explicitly risk-accepted with an owner and date;
- `npm run check`, PostgreSQL integration tests, all Playwright browsers, Android tests, final-container smoke tests, and a clean restore pass from a fresh checkout;
- an upgrade under traffic produces no API 502s or missing lazy chunks;
- Today, Goals, Trends, and MCP agree on boundary, source-resolution, derived-metric, and generalized-goal fixtures;
- deletion/retention cannot leave effective or projected values behind;
- an off-host encrypted backup is restored into an independent environment;
- the setup, source-management, goal, logging, deletion, and recovery journeys pass keyboard plus NVDA/VoiceOver review at desktop and mobile widths.

## Final recommendation

Continue with the current modular-monolith architecture. Do not introduce microservices, event streaming, AI deduplication, or a generic metric query language. The highest return now comes from closing consistency and operations gaps around the architecture already built: one time-range contract, one invalidation path, one goal-evaluation model, one deterministic runtime artifact, and one verifiable deployment/restore process.
