# TrackIt — Iteration Plan

Status: working delivery plan

This plan turns the product design into small, reviewable increments. Each iteration should end with a usable application, a short demonstration, passing checks, and an explicit decision to continue or adjust.

## Working method

Each iteration follows the same loop:

1. Confirm the user outcome and acceptance criteria.
2. Implement the smallest complete vertical slice.
3. Test behavior, accessibility, failure states, and responsive layouts.
4. Review the result in the browser using realistic data.
5. Record decisions and update the next iteration if necessary.

An iteration is complete only when its acceptance criteria pass. New ideas discovered during an iteration go into the backlog unless they are required for correctness, safety, or the stated outcome.

## Definition of done

Every implementation iteration must satisfy the following baseline:

- TypeScript compilation and production build pass.
- New logic has proportionate automated tests.
- Primary flows work with keyboard and touch input.
- Desktop, tablet, and narrow mobile layouts remain usable.
- Loading, empty, error, and success states are represented.
- Health values retain timestamp, unit, and provenance.
- Sensitive values and credentials never appear in application logs.
- Documentation and configuration examples match the implementation.
- Existing user data survives upgrades or has a documented migration path.

## Current baseline — Iteration 0

### Outcome

A polished interaction prototype establishes the product direction and core information architecture.

### Delivered

- Responsive Today, Journal, Trends, Connections, and Settings screens.
- Mantine component library, Tabler icons, and Recharts visualizations.
- Quick-add for meals, water, weight, and energy check-ins.
- Browser-local persistence, journal filters/search, duplicate/delete, and JSON export.
- Interactive MCP, Health Connect, and settings dialogs.
- Product, architecture, privacy, and UX design specification.

### Known limitations

- Representative and manually entered data only.
- Browser storage is the only persistence layer.
- No identity, server API, database, MCP endpoint, or Android companion.
- Settings other than MCP state are not yet persisted.
- Charts use representative data rather than calculated aggregates.

---

## Iteration 1 — Repository and quality foundation

### User outcome

The application remains visually unchanged, but contributors can develop and change it safely.

### Scope

- Initialize and document the repository structure.
- Split the single application file into pages, shared components, domain types, fixtures, and hooks.
- Add client-side routing with stable, bookmarkable URLs.
- Add an application theme through Mantine rather than scattered component defaults.
- Configure ESLint, Prettier, Vitest, React Testing Library, and Playwright.
- Add route-level lazy loading to reduce the initial bundle.
- Establish environment configuration and validation.

### Deliverables

```text
src/
  app/            providers, router, theme
  components/     shared UI and data-display components
  features/       today, journal, trends, connections, settings
  domain/         records, units, provenance, schemas
  lib/            storage and utility adapters
tests/
  e2e/
```

### Acceptance criteria

- Direct navigation and refresh work for every page URL.
- Today and Journal have component-level behavior tests.
- The critical flow “quick add → journal → refresh → delete” passes in Playwright.
- No TypeScript or lint errors.
- No production JavaScript chunk exceeds the agreed initial budget without justification.
- Existing browser-local records remain readable after refactoring.

### Explicitly deferred

- Server API, database, and authentication.

---

## Iteration 2 — Self-hosted server and PostgreSQL

### User outcome

Health and nutrition records survive browser resets and are stored on the user's server.

### Scope

- Add a TypeScript API service with an OpenAPI contract.
- Add PostgreSQL and versioned database migrations.
- Implement observations, meals, journal entries, sources, and user preferences.
- Replace direct localStorage use with an API repository abstraction.
- Add optimistic updates with visible retry and conflict handling.
- Provide Docker Compose for web/API and PostgreSQL.
- Add health/readiness endpoints and structured, privacy-safe logging.

### Primary API surface

- `GET/POST /api/journal`
- `PATCH/DELETE /api/journal/{id}`
- `GET/POST /api/observations`
- `GET/POST /api/meals`
- `GET/PATCH /api/preferences`
- `GET /api/health` and `GET /api/ready`

### Acceptance criteria

- All current create, read, duplicate, search, filter, and delete flows use PostgreSQL.
- Refreshing, changing browsers, and restarting containers preserve records.
- Imported and manually entered records retain source, original unit, and timestamps.
- Duplicate retries do not create duplicate records.
- A clean installation starts with one documented command.
- Integration tests run against a temporary PostgreSQL instance.
- An upgrade from the previous migration completes without losing seeded test data.

### Migration behavior

On first connection, the UI offers to import existing browser-local records into the server. It previews the record count and only clears browser storage after confirmed server persistence.

### Explicitly deferred

- Multi-user access and external identity providers.

---

## Iteration 3 — Local identity and security boundary

### User outcome

Only the owner can access the installation and its health data.

### Scope

- Single-user setup ceremony for a new installation.
- Passkey-first login with password recovery-code fallback.
- Secure server sessions, CSRF protection, rate limiting, and strict security headers.
- Session/device management and sign-out-all-devices.
- Audit authentication, export, deletion, and permission changes.
- Protect all application and API routes except setup and health checks.
- Add reverse-proxy and HTTPS deployment guidance.

### Acceptance criteria

- A fresh installation cannot expose health data before owner setup.
- Unauthenticated API and page requests are rejected or redirected appropriately.
- Session cookies are HttpOnly, Secure in production, and use an appropriate SameSite policy.
- Login throttling and recovery flows have automated tests.
- Audit records identify actor, action, time, and target without containing health payloads or secrets.
- Security headers pass the project's automated policy checks.

### Explicitly deferred

- Household accounts, OIDC, sharing, and delegated access.

---

## Iteration 4 — Complete nutrition workflow

### User outcome

A user can quickly build an accurate daily food record without depending on a cloud service.

### Scope

- Local food catalog with nutrients per reference quantity.
- Food search ranked by recent, favorite, and exact matches.
- Serving units and gram conversion.
- Recipes with ingredients, yield, and reusable servings.
- Meal edit, copy, recent meal, and favorite meal flows.
- Daily energy and macro totals calculated from nutrient snapshots.
- Optional CSV food import adapter.

### UX checkpoints

- A repeated meal can be logged in at most three interactions.
- Quantity editing stays in context and updates totals immediately.
- Estimated and incomplete nutrition values are visibly differentiated.
- No target is required to benefit from the nutrition view.

### Acceptance criteria

- Food, recipe, and meal calculations have unit tests covering conversion and rounding.
- Editing a food later does not silently rewrite historical meal totals.
- Recipe yield changes correctly recalculate future servings.
- The Today dashboard reads actual daily nutrition aggregates.
- Repeated meal entry takes under 20 seconds in a usability test.

### Explicitly deferred

- Barcode databases, meal-photo recognition, and cloud food-provider dependencies.

---

## Iteration 5 — Measurements, goals, and truthful trends

### User outcome

The dashboard and charts represent the user's real data and clearly communicate gaps and uncertainty.

### Scope

- Complete scalar and interval observation model.
- Configurable units and unit conversion.
- Optional goals with effective dates and schedules.
- Reproducible daily and weekly aggregates.
- Trend metric/range selection and saved views.
- Missing-data display, outlier exclusion, and underlying-record inspection.
- Deterministic insights based on personal rolling baselines.

### Acceptance criteria

- Changing display units does not alter stored canonical values.
- Goal changes do not rewrite historical goal context.
- Charts show missing days rather than interpolating them silently.
- Every aggregate links back to the contributing records.
- Correlation output includes sample size, time window, lag, and a non-causation statement.
- Calculations are covered by fixed, timezone-sensitive test datasets.

### Explicitly deferred

- Generated medical interpretation and predictive scoring.

---

## Iteration 6 — Read-only MCP server

### User outcome

The owner can let a compatible assistant answer bounded questions about selected data with complete visibility and control.

### Scope

- Add a remote MCP endpoint using the official TypeScript SDK.
- Implement resources for profile preferences, metric catalog, daily summaries, and saved reports.
- Implement read tools for summaries, measurements, meals, nutrition, comparisons, and journal search.
- Create per-client credentials with expiry, category scopes, and optional date limits.
- Add client management, revocation, rate limiting, and access-log UI.
- Minimize tool output and include units, timezone, coverage, and missing-data notes.

### Acceptance criteria

- MCP is disabled by default and enabling it does not automatically issue a credential.
- A client cannot access a category or date outside its grant.
- Revocation blocks the next request.
- Every MCP request produces an audit event attributable to a client and tool.
- Tool responses are schema-tested and contain provenance/completeness metadata.
- Prompt-injection content stored in notes is returned as data, never interpreted as server instructions.

### Explicitly deferred

- MCP write tools and health recommendations.

---

## Iteration 7 — Android companion foundation

### User outcome

The user can securely pair an Android device with their self-hosted TrackIt installation.

### Scope

- Create the Kotlin/Jetpack Compose companion application.
- Detect Health Connect availability and supported Android versions.
- Pair using a short-lived QR code and device-bound credential.
- Display server identity for verification before pairing.
- Add device list, last-seen state, and revocation in the web application.
- Establish authenticated, batched, resumable upload transport.

### Acceptance criteria

- Pairing codes expire, are single-use, and reveal no reusable server secret.
- Pairing requires explicit confirmation on both server UI and Android device.
- Revoked devices cannot upload further data.
- Interrupted uploads retry idempotently.
- TLS and invalid-certificate behavior are clearly documented for home-server deployments.

### Explicitly deferred

- Health Connect record permissions and synchronization.

---

## Iteration 8 — Health Connect synchronization

### User outcome

Steps, sleep, weight, heart rate, and exercise from Android appear reliably in TrackIt with visible provenance.

### Scope

- Just-in-time Health Connect permission education and category selection.
- Initial import with progress and cancellation.
- Separate change cursor per record type.
- Incremental foreground sync and optional background-read permission.
- Source-version deduplication and deletion propagation.
- Sync health, diagnostics, retry, and expired-cursor recovery.
- Today and Trends integration for imported records.

### Initial record types

1. Steps
2. Sleep sessions
3. Weight
4. Heart rate and resting heart rate
5. Exercise sessions

### Acceptance criteria

- Repeating a sync produces zero duplicate records.
- Partial category failure does not roll back successful categories.
- Revoked permissions are reflected without alarming error language.
- Source deletions propagate according to the documented retention policy.
- Expired cursor recovery re-reads and deduplicates the required window.
- Timezone travel and daylight-saving test cases preserve the correct observed time.
- Every imported value identifies Health Connect and its original data origin.

### Explicitly deferred

- Write-back to Health Connect, routes/GPS, and medical records.

---

## Iteration 9 — Backups, restore, and data lifecycle

### User outcome

The owner can prove their data is portable, recoverable, and deletable.

### Scope

- Encrypted scheduled PostgreSQL backups.
- Backup destination abstraction with a local-filesystem implementation.
- Restore workflow and clean-environment restore command.
- Versioned JSON and CSV export for all supported records.
- Category retention rules and account deletion.
- Backup health and last verified-restore state in Settings.

### Acceptance criteria

- A production-like dataset restores into a clean installation during CI/release testing.
- Backup failures are visible and actionable.
- Encryption keys are external to backup archives.
- Export schemas are versioned and documented.
- Deletion removes or cryptographically renders inaccessible the selected data while retaining only required non-sensitive audit facts.

---

## Iteration 10 — MCP writes and automation

### User outcome

An explicitly authorized assistant can log selected records without gaining broad or destructive access.

### Scope

- Separately scoped write tools for measurements, meals, and check-ins.
- Preview-first responses for complex meal creation.
- Confirmation-token flow for destructive actions.
- Idempotency keys and machine-created provenance.
- Per-tool authorization, quotas, and immediate revocation.

### Acceptance criteria

- Read credentials cannot call write tools.
- A duplicate tool retry does not create a duplicate record.
- Every machine-created record is visibly labeled in the Journal.
- Delete requires a valid, short-lived confirmation tied to the exact target.
- Revoked credentials cannot complete a previously previewed destructive action.

### Explicitly deferred

- Autonomous coaching, diagnosis, or unreviewed bulk modifications.

---

## Iteration 11 — Release hardening

### User outcome

TrackIt can be upgraded and operated confidently as a long-lived self-hosted service.

### Scope

- Full WCAG 2.2 AA audit and remediation.
- Threat model and external-facing security review checklist.
- Dependency, container, and secret scanning.
- Large-history performance and slow-device tests.
- Database migration, rollback, and restore drills.
- Installation, reverse proxy, upgrade, backup, and troubleshooting documentation.
- Release artifacts, checksums, changelog, and support matrix.

### Acceptance criteria

- No critical accessibility or security findings remain open.
- P95 dashboard and journal response targets pass with five years of representative data.
- Upgrade from the previous supported release and restore from backup both pass in clean environments.
- A new self-hoster can install, secure, back up, update, and recover the service using only the documentation.

---

## Cross-iteration backlog

These features should not interrupt the core sequence unless user validation changes their priority:

- Multiple isolated household accounts.
- OIDC and reverse-proxy authentication.
- iOS HealthKit companion.
- Additional Health Connect data types.
- Route/GPS visualization as a separately granted sensitive category.
- Barcode scanning and optional public food-database adapters.
- FHIR import/export for compatible observations.
- Custom metric builder.
- Themes beyond the supported light/dark modes.
- Localization beyond the initial locale-aware formatting.

## Recommended sequence and review gates

| Gate                  | Iterations | Decision before continuing                                                |
| --------------------- | ---------: | ------------------------------------------------------------------------- |
| Frontend foundation   |        0–1 | Is the interaction model stable enough to back with permanent APIs?       |
| Trustworthy local app |        2–5 | Can the owner securely record, understand, export, and recover core data? |
| Assistant access      |          6 | Is the read-only MCP surface minimal, useful, and auditable?              |
| Google health sync    |        7–8 | Is Android pairing acceptable and is sync demonstrably reliable?          |
| Operational readiness |          9 | Can data ownership and recovery claims be proven?                         |
| Controlled automation |         10 | Are write grants and confirmations understandable and safe?               |
| Public release        |         11 | Is the application supportable as a long-lived self-hosted product?       |

## Immediate next iteration

Proceed with Iteration 1. It reduces the risk of every later change and gives us routing, tests, a coherent theme, and maintainable feature boundaries before server contracts make the frontend structure more expensive to change.
