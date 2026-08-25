# Metric Data Architecture

## Objective

TrackIt must expose one consistent, efficient metric series to Today, Goals, Trends, MCP, and future consumers while retaining immutable source records for audit and export.

```text
Raw source records
    -> canonical observations
    -> exact identity resolution
    -> source enablement and overlap policy
    -> effective observations
    -> derived metrics
    -> versioned projections
    -> bounded consumer APIs
```

## Architectural invariants

- Raw imported records are never deleted by deduplication.
- Connector, provider, origin, and external identity remain distinguishable.
- `/api/observations` returns only effective observations.
- Normal consumers cannot select the raw series.
- Canonical observations remain authoritative; projections are disposable.
- Daily boundaries use the user's IANA timezone.
- Projection replacement is atomic.
- Projection freshness depends only on resolution semantics, not unrelated preferences.
- Derived metrics use the same effective inputs as every other consumer.
- Consumer queries are bounded by time and, where practical, metric.

## Implementation plan and status

### Phase 1 - Existing effective-series foundation

- [x] Preserve raw Health Connect records and external identities.
- [x] Resolve exact duplicates, disabled sources, overlaps, and source priority.
- [x] Keep `/api/observations` effective-only.
- [x] Replace Metrics Center raw-history loading with `/api/metric-sources`.
- [x] Add BMI and calorie-balance definitions.
- [x] Add a daily projection cache for compact Today history.
- [x] Correct daily cache algorithm-version semantics.

### Phase 2 - Projection correctness

- [x] Replace daily projection rows atomically.
- [x] Calculate daily boundaries in the user's timezone.
- [x] Add a dedicated metric resolution version.
- [x] Add projection indexes for user, date, metric, and active observation ranges.
- [x] Rebuild stale or missing projection dates deterministically.

### Phase 3 - Server-owned effective metric service

- [x] Centralize observation normalization and source resolution in one server service.
- [x] Integrate meal nutrient observations before derived metric calculation.
- [x] Resolve BMI height dependencies across date boundaries.
- [x] Make Goals, Trends, Today, and MCP consume the same server-owned result.

### Phase 4 - Bounded and efficient consumers

- [x] Add metric filters to effective observation queries.
- [x] Require or enforce safe query bounds for interactive consumers.
- [x] Use daily projections to discover Trends metrics and load detail only for the selected range.
- [x] Evaluate goal status server-side from bounded effective inputs.
- [x] Push MCP date and metric filters into repository queries.

### Phase 5 - Operational hardening

- [x] Avoid synchronous full-history rebuilds on preference writes.
- [x] Use resolution-version invalidation with durable dirty-date processing and bounded read repair.
- [x] Record projection algorithm and resolution versions.
- [x] Add cache consistency and query-volume tests.
- [x] Document recovery and rebuild procedures.

## Current consumer map

| Consumer              | Authoritative source                                                         |
| --------------------- | ---------------------------------------------------------------------------- |
| Today current details | Metric-filtered effective observations for the selected local day            |
| Today history         | Versioned effective daily projection                                         |
| Goals                 | Server-evaluated goals over one bounded effective-series query               |
| Trends                | Daily projection for discovery, then bounded effective detail for charting   |
| Metrics Center        | Aggregated metric-source summary; it does not load observation history       |
| MCP                   | Date- and metric-bounded effective metric service                            |
| Export                | Raw records and projections; raw access remains an explicit internal pathway |

## Validation requirements

- Two overlapping 7,000-step providers with one disabled produce 7,000 everywhere.
- Changing source priority invalidates only metric projections.
- A local-day observation is assigned consistently across DST boundaries.
- Projection failure cannot leave a partially rebuilt date.
- BMI uses the latest eligible effective height even when recorded on an earlier date.
- Calorie balance uses effective expenditure and canonical meal intake.
- Goals, Trends, Today, and MCP agree for the same metric and time window.
- Interactive APIs do not load unbounded observation history.

## Change log

- 2026-08-25: Created the living architecture plan after the effective-series and daily-cache review. Phase 1 reflects the implemented baseline; remaining phases are active work.
- 2026-08-25: Made daily replacement transactional and timezone-aware, added semantic resolution versions and active-observation indexes, centralized server effective-series construction with meal nutrients and cross-day BMI context, removed client-side meal/effective-series reconstruction, bounded the observations API and MCP reads, and added metric filtering.
- 2026-08-25: Changed Trends to discover metrics through compact daily projections and request detail only for selected metrics and ranges. Preference writes now increment the resolution version and return without rebuilding full history; bounded reads repair stale projection dates lazily.
- 2026-08-25: Moved goal evaluation to `/api/goals/evaluations`, using one bounded, metric-filtered effective-series query for all goals. Added DST boundary, cross-day BMI, meal-backed calorie balance, source-resolution cache, and bounded-query coverage.
- 2026-08-25: Standardized effective queries on half-open ranges, added durable dirty-date and completed-materialization records, moved Health Connect projection work out of ingestion transactions, and made lifecycle deletions invalidate affected owner-local dates.

## Projection recovery

Daily projections are disposable. `daily_projection_runs` records completion even for an empty day; `projection_dirty_dates` durably records mutation work. A row is stale when its derivation version, metric resolution version, or timezone differs from current preferences. The background worker drains dirty dates, while `/api/daily-metrics` repairs only stale or dirty dates in the requested range through atomic date replacement. A full Health Connect rebuild remains available through `/api/health-records/rebuild`; raw `health_records`, observations, and meals remain authoritative. Never repair projection failures by deleting raw records.

## Final re-audit

The completed read path is `raw records -> exact deduplication -> provider-aware overlap resolution -> metric policy and source priority -> effective series -> derived metrics -> projections and consumers`. Interactive consumers no longer reconstruct this pipeline independently, and the public observations API cannot return raw observations.

The current design is appropriate for TrackIt's single-owner deployment. Its deliberate scale boundaries are:

- Preference-version changes can still add bounded repair latency before the worker encounters a date; source-ingestion and lifecycle mutations already use the durable dirty-date worker.
- Source identity remains available in observation metadata and is accelerated by expression indexes. Normalize it into dedicated columns only when query volume justifies the migration.
- Historical BMI context reads a bounded set of recent height observations. Replace this with a per-source window query if the number of simultaneous height providers grows substantially.
- Interval overlap resolution scales with concurrently active intervals. A pathological set of thousands of long, mutually overlapping records can still be quadratic and should trigger a database/window-based resolver.

These are documented capacity triggers, not correctness gaps. Atomic replacement, semantic invalidation, owner-timezone boundaries, canonical units, effective-only consumers, and raw-record preservation are enforced in the current implementation.
