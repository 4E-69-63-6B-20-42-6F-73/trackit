# TrackIt Core Model Simplification

## Objective

Refactor TrackIt so the implementation consistently enforces this architectural rule:

```text
Commands mutate:
    Observations
    Source records
    Reference/configuration data

Queries read:
    Observations
    Projections

No projection has commands.
```

The existing observation-centric architecture is the intended design. Do not redesign the product around a new domain model.

The goal is to remove remaining legacy paths, duplicate write models, projection-specific mutation behavior, and legacy observation identity fields.

---

# Core invariants

Treat these as hard architectural constraints.

## 1. Observation is the canonical application fact

Anything that happened to or was recorded about the user is represented as an Observation.

Examples include:

- weight
- sleep
- exercise
- symptoms
- notes
- meals
- nutrient components
- manually recorded measurements
- interpreted Health Connect data

Observations may be:

- numeric
- textual
- boolean
- categorical
- event-like
- compound

Do not introduce another canonical persistence model for these facts.

---

## 2. `definitionId` is the canonical Observation identity

Every Observation references its semantic definition through:

```text
definitionId
```

`definitionId` is the canonical identifier for what the Observation represents.

Examples:

```text
weight
sleep-duration
protein
calories
meal
symptom
note
heart-rate
```

The exact identifiers must come from the existing definition system / Metric Center rather than ad hoc strings introduced throughout the application.

The legacy Observation field:

```text
metric
```

must be removed.

Do not keep both `definitionId` and `metric` as competing identifiers.

The desired model is:

```text
Observation
    definitionId
         ↓
Observation Definition / Metric Center
    identity
    value semantics
    units
    conversions
    labels
    aggregation behavior
    presentation defaults where appropriate
```

---

## 3. Metric Center owns metric semantics and conversion

For definitions representing measurable quantities, the Metric Center owns:

- canonical metric identity
- canonical unit
- supported input/display units
- conversion rules
- value formatting
- labels
- aggregation behavior where applicable
- metric metadata

Observation code must not recreate conversion tables or canonical unit rules independently when those rules belong in the Metric Center.

Conceptually:

```text
Observation
    definitionId
    numericValue
    unit
         ↓
Metric Center
    definition
    canonical unit
    conversion rules
```

The same definition mechanism may also represent non-numeric observations such as:

- meal
- note
- symptom event
- compound observations

Conversion behavior simply does not apply to definitions where it is meaningless.

Do not introduce a separate identity system for non-numeric Observations.

---

## 4. Source records are ingestion records

External providers may persist source records before they are interpreted as Observations.

Conceptually:

```text
External provider
      ↓
Source record
      ↓
Derivation / interpretation
      ↓
Observation
```

Source records may contain provider-specific/raw metadata.

Application features should not depend directly on source records unless they are specifically part of:

- ingestion
- reconciliation
- diagnostics
- re-derivation
- provenance inspection

---

## 5. Reference/configuration data may be mutable

These are valid command targets because they are not user Observations.

Examples:

- foods
- recipes
- observation definitions
- Metric Center configuration
- preferences
- goals
- saved views
- integration configuration
- sources
- application settings

Do not convert these into Observations unnecessarily.

---

## 6. Projections are read models

Examples include:

- Journal
- Today
- daily metrics
- trends
- goal progress/results
- dashboards
- summaries
- derived aggregate views

A projection may be:

- dynamically computed
- cached
- materialized for performance

A projection must never become an independent source of truth.

---

## 7. No projection has commands

This is the most important invariant.

There must not be application commands such as:

```text
createJournalEntry
updateJournalEntry
deleteJournalEntry
updateDailyMetric
createTrendResult
editGoalProgress
```

If a projection appears editable, resolve the underlying canonical entity and mutate that instead.

Example:

```text
Journal row
    ↓ references
Observation
    ↓
PATCH /api/observations/:id
```

Deleting a Journal row means deleting or otherwise mutating the underlying Observation.

Creating something that appears in Journal means creating an Observation.

---

# Target command/query model

The repository should converge on this mental model:

```text
Commands
│
├── Observation commands
│     create
│     update
│     delete
│
├── Source-record commands
│     ingest
│     reconcile
│     delete where appropriate
│
└── Reference/configuration commands
      foods
      recipes
      goals
      preferences
      sources
      definitions
      settings
```

Queries:

```text
Queries
│
├── Observation queries
│
└── Projection queries
      Journal
      Today
      daily metrics
      trends
      goal progress
      summaries
```

Internal projection materializers may write projection tables, but those writes are not domain commands.

---

# Phase 1 — Inventory the architecture before modifying it

Before making broad changes, inventory:

- all mutating API endpoints
- all Observation writers
- all Source-record writers
- all reference/configuration writers
- all projection endpoints
- all frontend mutations
- all uses of `observation.metric`
- all uses of `definitionId`
- all conversion logic
- all source/provider identity fields
- all projection-specific metadata stored in canonical records
- all Health Connect ingestion paths

For every mutating endpoint ask:

> What canonical thing does this mutate?

The answer must be one of:

```text
Observation
Source record
Reference/configuration data
```

If the answer is a projection, the endpoint violates the architecture.

---

# Phase 2 — Remove Journal as a write model

Audit all Journal-related frontend and backend code.

Journal must become a query-only projection over Observations.

## Remove legacy Journal mutation APIs

Find and eliminate client functions equivalent to:

```text
createJournal
updateJournal
deleteJournal
```

Do not replace these with different Journal mutation endpoints.

Use Observation commands instead.

Expected API direction:

```text
GET /api/journal
```

is valid.

These are not:

```text
POST /api/journal
PATCH /api/journal/:id
DELETE /api/journal/:id
```

If dead backend handlers for these routes remain, remove them.

If tests expect Journal commands, rewrite those tests around:

```text
Observation mutation
    ↓
Journal query
```

---

# Phase 3 — Eliminate dual writes

Audit:

- `App.tsx`
- quick-add flows
- Journal hooks
- forms
- creation dialogs
- edit flows
- delete flows

Remove any behavior where one user action writes both:

```text
Journal state
+
Observation state
```

A command should happen once.

Correct flow:

```text
User action
    ↓
create/update/delete Observation
    ↓
invalidate/refetch affected projections
    ↓
Journal / Today / Metrics / Trends update
```

There must not be a failure state where:

```text
Journal write succeeded
Observation write failed
```

or:

```text
Observation write succeeded
Journal write failed
```

That state represents a violation of the architecture.

Remove retry/reconciliation code whose sole purpose is keeping Journal mutations synchronized with Observation mutations.

---

# Phase 4 — Simplify Journal frontend state

Review `useJournal` and related hooks.

Journal should behave as projection query state.

Target responsibilities:

```text
query Journal
loading state
error state
refresh/invalidate
filters
date/range state
```

Remove responsibilities such as:

```text
add Journal event
update Journal event
delete Journal event
persist Journal events
reconcile Journal mutations
migrate Journal writes
```

If localStorage currently stores canonical Journal events, remove that behavior unless it is required by a deliberate offline architecture.

Do not preserve accidental offline behavior simply because it exists.

If offline mutation support is required later, implement it at the command layer using an Observation outbox.

Do not implement offline persistence by making Journal canonical.

---

# Phase 5 — Route Journal interactions through Observation commands

Inspect every interactive action available from Journal.

## Edit

Resolve the underlying Observation ID and mutate the Observation.

Example:

```text
JournalEntry.entityId
    ↓
PATCH /api/observations/:id
```

## Delete

Delete or modify the underlying Observation.

Example:

```text
DELETE /api/observations/:id
```

## Add

Create an Observation or invoke a domain-specific command that ultimately creates Observations.

Examples:

```text
createObservation(...)
createMeal(...)
ingestHealthRecord(...)
```

A domain-specific command is acceptable when it provides useful invariants or orchestration.

It must still terminate in canonical persistence.

---

# Phase 6 — Align the shared Observation type with the actual model

Audit all shared TypeScript Observation types and runtime schemas.

The Observation model must not imply:

```text
Observation = numeric metric datapoint
```

The canonical model supports multiple value types.

Prefer a common base with explicit variants.

Conceptually:

```text
ObservationBase
    id
    definitionId
    occurredAt
    sourceId
    origin
    state
    attributes
    metadata

NumericObservation
    valueType = numeric
    numericValue
    unit

TextObservation
    valueType = text
    textValue

BooleanObservation
    valueType = boolean
    booleanValue

CategoryObservation
    valueType = category
    categoryValue

EventObservation
    valueType = event

CompoundObservation
    valueType = compound
```

The exact implementation may differ based on existing schemas.

Avoid unnecessary abstraction.

Preserve compatibility where practical, but do not keep stale domain types merely to avoid changing callers.

---

# Phase 7 — Remove legacy `metric` from Observations

This is an explicit migration target.

`definitionId` is canonical.

`metric` is legacy and must be removed.

## 7.1 Inventory all `metric` consumers

Search the entire repository, including:

- frontend
- server
- DB queries
- projection code
- Metric Center
- Journal
- daily metrics
- trends
- goals
- meal/nutrition code
- Health Connect derivation
- MCP
- tests
- scripts
- Android-facing APIs
- migrations
- exports

Classify every use as:

```text
identity lookup
display label
projection grouping
aggregation key
conversion lookup
compatibility field
external API field
legacy code
```

---

## 7.2 Replace identity lookups with `definitionId`

Any code using:

```text
observation.metric
```

to determine what an Observation represents must move to:

```text
observation.definitionId
```

Do not replace one duplicated identifier with another arbitrary string field.

---

## 7.3 Resolve semantics through Metric Center

Where code currently obtains things like:

```text
metric name
label
canonical unit
supported units
conversion function
formatting
aggregation behavior
```

from local conditionals or `metric` string switches, move those responsibilities to the Metric Center / definition registry where appropriate.

Avoid patterns like:

```text
if metric === "weight" ...
if metric === "distance" ...
if metric === "temperature" ...
```

scattered across application layers.

Prefer:

```text
definition = metricCenter.get(definitionId)
```

followed by behavior exposed by the definition.

---

## 7.4 Update projections to use `definitionId`

Journal, Today, daily metrics, trends, goals, dashboards and other projections must identify Observation meaning through:

```text
definitionId
```

Replace conceptual behavior like:

```text
group by observation.metric
```

with:

```text
group by observation.definitionId
```

Where more information is required, resolve the referenced definition.

---

## 7.5 Update meal component Observations

Meals remain compound Observations.

Their nutrient components should reference Metric Center definitions.

Conceptually:

```text
Meal Observation
  definitionId = meal

components:
  definitionId = calories
  definitionId = protein
  definitionId = carbohydrates
  definitionId = fat
```

Do not rely on:

```text
metric = "meal"
```

or nutrient metric strings as a parallel discriminator.

---

## 7.6 Update imported Health data

Health Connect derivation should map source records to definition-backed Observations.

Conceptually:

```text
Health Connect record
       ↓
definition resolver
       ↓
Observation.definitionId
```

Unit handling should use the Metric Center where those conversion semantics belong.

Preserve raw/provider-specific source information where necessary for provenance.

Do not duplicate canonical metric identity into Observation metadata.

---

## 7.7 Update APIs and DTOs

Remove `metric` from canonical Observation API types.

If a compatibility API still needs to expose a field named `metric`, derive it from the referenced definition temporarily.

Do not store it merely to satisfy legacy consumers.

Any compatibility field should be:

- explicitly temporary
- derived
- documented
- removed once all consumers migrate

---

## 7.8 Backfill `definitionId`

Before removing the database column:

- ensure every Observation has a valid `definitionId`
- identify rows where it is missing
- map legacy `metric` values to definitions
- fail loudly for unmappable values
- do not invent silent mappings
- validate numeric Observation units against their definitions where possible

Create migration validation capable of identifying unresolved legacy data.

---

## 7.9 Stop writing `metric`

Once writers are migrated:

```text
Observation writes:
    definitionId ✓
    metric ✗
```

The DB column may temporarily remain during staged migration, but application code must stop populating it.

---

## 7.10 Remove the database column

Once all reads and writes have migrated:

```text
DROP observations.metric
```

Also remove:

- indexes based on `metric`
- old query filters
- DTO fields
- schemas
- fixtures
- test helpers
- import mappings
- projection grouping logic
- compatibility code no longer used

---

# Phase 8 — Centralize conversions in Metric Center

Audit unit conversion logic throughout the repository.

Look for:

- hardcoded conversion factors
- local conversion maps
- per-feature unit normalization
- importer-specific canonicalization logic
- UI-side conversion duplication
- projection-side conversion duplication

Where conversion represents domain semantics of a metric, move it behind the Metric Center.

Desired direction:

```text
recorded value + recorded unit
        ↓
definitionId
        ↓
Metric Center
        ↓
canonical or requested unit
```

Do not force all stored numeric values into a single display unit if retaining the recorded/original unit is useful.

Clearly distinguish:

```text
recorded value
canonical value
display value
```

if the system needs all three concepts.

Avoid storing multiple equivalent values unless there is a clear persistence reason.

---

# Phase 9 — Normalize source identity

Audit source/provider identity.

Look for duplication through:

```text
sourceId
metadata.source
metadata.dataOrigin
metadata.connector
provider
connector
dataOrigin
```

Distinguish between:

```text
canonical source identity
```

and:

```text
provider-specific source metadata
```

For an Observation, prefer canonical source identity through:

```text
sourceId
```

Source records may retain richer provider-specific provenance.

Journal and other projections should ideally obtain display information through the canonical Source relation rather than fallback inference across arbitrary Observation metadata.

Do not remove provenance fields required for:

- debugging
- reconciliation
- re-import
- external ID matching
- source-specific diagnostics

---

# Phase 10 — Audit projection-specific data in Observations

Find attributes whose purpose is tied directly to one projection.

Examples to inspect:

```text
journalDetail
showInJournal
```

Determine whether each field represents:

1. genuine domain/user data
2. definition metadata
3. user configuration
4. presentation-only projection state

Prefer this separation:

```text
Observation
    semantic fact/data

Definition / Metric Center
    semantic metadata
    labels
    formatting defaults

User configuration
    visibility/preferences

Journal projection
    Journal-specific formatting
```

Do not store Journal-specific presentation state in canonical Observations unless there is a clear semantic requirement.

A user note or description is valid canonical data.

A preformatted Journal subtitle usually is not.

---

# Phase 11 — Verify Meal authority

Meals are already modeled as compound Observations.

Preserve this architecture.

Inspect duplication between:

```text
meal.attributes.nutrientSnapshot
```

and:

```text
nutrient component Observations
```

Determine which representation is authoritative.

Prefer nutrient component Observations as canonical if they already drive metrics and projections.

If `nutrientSnapshot` is a cache:

- make that explicit
- make it rebuildable where practical
- ensure it cannot diverge silently

If it represents an immutable historical snapshot required to preserve what was known at meal creation time, document that distinction clearly.

Do not remove it without checking:

- recipe edits
- food edits
- historical nutrition integrity
- meal editing behavior
- recalculation behavior

---

# Phase 12 — Clarify Health Connect ingestion

Preserve this conceptual flow:

```text
Health Connect
    ↓
Source record
    ↓
derivation
    ↓
Observation
```

Audit whether both of these currently exist:

```text
Device → direct Observation
Device → Source record → Observation
```

Determine whether direct device metric upload is legacy.

If Health Connect can safely converge on the Source-record path, consolidate toward it.

Do not break deployed Android clients without a migration/versioning strategy.

Desired long-term boundaries:

```text
Manual/internal command
    → Observation

External/provider command
    → Source record
    → Observation
```

---

# Phase 13 — Keep projections rebuildable

Do not turn materialized projections into canonical persistence.

Preserve the rebuildable nature of things such as:

- derived observations explicitly designated as derived
- daily metrics
- projection runs
- dirty-date tracking
- aggregate caches

Writes to projection tables are valid only as internal projection maintenance.

The distinction is:

```text
Domain command
    cannot target projection

Projection materializer
    may rebuild projection state
```

---

# Phase 14 — Separate projection maintenance from reads where practical

Review cases where a projection query:

```text
reads
→ detects stale state
→ rebuilds
→ reads again
```

Do not introduce new infrastructure just to avoid this.

Where practical, move toward:

```text
canonical command
    ↓
mark projection dirty
    ↓
projection updater
    ↓
query reads projection
```

If synchronous rebuild-on-read is currently required, preserve correctness and record further decoupling as follow-up work.

Do not introduce:

- message brokers
- CQRS frameworks
- event buses
- workers

unless there is already a concrete requirement.

---

# Phase 15 — Split oversized repository abstractions

Review `DataRepository` / `PostgresDataRepository`.

Avoid organizing storage around fake domain boundaries that contradict the Observation model.

Prefer capability-based persistence such as:

```text
ObservationRepository
SourceRecordRepository
ProjectionRepository
NutritionCatalogRepository
ConfigurationRepository
```

Domain services may sit above these.

Example:

```text
MealService
    ↓
ObservationRepository
NutritionCatalogRepository
Metric Center
```

A Meal service does not imply Meal requires an independent canonical storage model.

Avoid one giant repository interface containing unrelated concerns.

Also avoid excessive repository abstraction purely for architectural appearance.

---

# Phase 16 — Split server route registration

Reduce `server/app.ts` toward:

- server creation
- middleware
- shared infrastructure
- route registration

Suggested direction:

```text
server/
    app.ts
    routes/
        auth.ts
        observations.ts
        projections.ts
        nutrition.ts
        integrations.ts
        settings.ts
```

Exact boundaries should follow existing code.

Do not create an unnecessary routing framework.

The goal is to make command and query ownership easy to understand.

---

# API review rule

For every mutating API endpoint, ask:

> What canonical thing does this mutate?

Valid answers:

```text
Observation
Source record
Reference/configuration data
```

Invalid answers:

```text
Journal
Trend
Daily metric
Dashboard
Goal progress
Summary
Other projection
```

For every query endpoint determine whether it reads:

```text
Observations
```

or:

```text
a projection derived from canonical data
```

Make that relationship obvious in naming and implementation.

---

# Frontend review rule

For every UI mutation:

```text
button
form
context menu
quick add
edit dialog
delete action
import action
```

trace the command all the way to persistence.

There must be one canonical mutation path.

Avoid:

```text
optimistic projection persistence
+
canonical persistence
+
reconciliation
```

Prefer:

```text
optimistic command UI if desired
+
one canonical command
+
projection invalidation/refetch
```

Optimistic rendering is allowed.

Optimistic persistence of a projection is not.

---

# Definition/Metric Center review rule

For every place that needs to know what an Observation represents, ask:

> Can this be resolved from `definitionId`?

For every place that performs conversion, ask:

> Does this conversion belong to the Metric Center?

For every string comparison such as:

```text
weight
distance
protein
calories
heart_rate
```

determine whether the code is:

- legitimate domain branching
- or duplicated definition behavior that belongs in Metric Center

Do not mechanically move every conditional into Metric Center.

Only centralize semantics that are actually definition-level behavior.

---

# Testing requirements

Add or update tests that enforce the architecture.

## Journal creation

1. Create an Observation.
2. Query Journal.
3. Verify the projected Journal row appears.

There must be no Journal create command.

---

## Journal editing

1. Create an Observation.
2. Query Journal.
3. Edit through the Observation command.
4. Query Journal again.
5. Verify the projection changed.

---

## Journal deletion

1. Create an Observation.
2. Confirm it appears in Journal.
3. Delete the Observation.
4. Confirm the Journal row disappears.

---

## Definition identity

Verify:

```text
Observation.definitionId
```

is sufficient to identify the Observation semantics.

New Observation writes must not populate `metric`.

---

## Unit conversion

For at least representative convertible definitions:

1. create or ingest a value in one supported unit
2. resolve the definition through Metric Center
3. convert to another supported unit
4. verify expected canonical/display value

Test conversion behavior in the Metric Center rather than repeating equivalent conversion tests throughout every feature.

---

## Legacy metric migration

Test:

- valid legacy metric maps to `definitionId`
- unknown legacy metric fails migration
- every migrated Observation has a valid definition
- no post-migration write requires `metric`

---

## Meal behavior

1. Create a Meal.
2. Verify root/component Observations.
3. Verify components use `definitionId`.
4. Verify Journal projection.
5. Verify daily nutrition/metrics projections.
6. Verify nutrient authority behavior.

---

## Imported source record

1. Ingest a Source record.
2. Derive Observation(s).
3. Verify Observations use valid `definitionId`.
4. Verify projections consume Observations rather than Source records directly.

---

## Projection rebuild

Verify materialized projections can be recreated from canonical inputs.

---

# Remove dead code

After migrating callers, actively remove:

- Journal mutation functions
- Journal mutation schemas
- Journal write endpoints
- stale API types
- dual-write reconciliation state
- obsolete localStorage Journal persistence
- dead Journal migration helpers
- stale tests for projection commands
- legacy `metric` query helpers
- legacy `metric` indexes
- duplicate conversion maps
- compatibility helpers with no active consumer
- obsolete import paths

Do not leave the previous architecture in place “just in case.”

Before deleting externally consumed behavior, inspect:

- Android clients
- scripts
- MCP
- documentation
- integrations
- tests
- exports

---

# Documentation

Update architecture documentation to state explicitly:

```text
Commands mutate:
    Observations
    Source records
    Reference/configuration data

Queries read:
    Observations
    Projections

No projection has commands.
```

Also document:

```text
Observation identity:
    definitionId

Metric semantics and conversions:
    Metric Center

Legacy observation.metric:
    removed
```

Document these flows:

```text
Manual entry
    → Observation
    → Journal / Metrics / Trends

External import
    → Source record
    → Observation
    → Journal / Metrics / Trends

Reference data
    → used to construct or interpret Observations
```

Make clear that Journal is a projection, not a storage model.

---

# Non-goals

Do not:

- rewrite the framework stack
- replace PostgreSQL
- replace Fastify
- replace React
- introduce event sourcing
- introduce CQRS libraries
- add a broker merely to separate commands and queries
- remove projections because they are materialized
- turn Foods or Recipes into Observations
- remove Source records required for faithful ingestion
- redesign unrelated UI
- perform broad cosmetic refactors
- introduce another Observation identity field after removing `metric`

Keep the work focused on simplifying and enforcing the existing architecture.

---

# Execution order

Work in this order:

```text
1. Inventory commands, projections, metric usage and definition usage
2. Remove Journal command usage
3. Collapse frontend dual writes into Observation commands
4. Simplify Journal client state
5. Update Journal architecture tests
6. Align Observation types with all supported value types
7. Migrate all identity logic from metric → definitionId
8. Centralize appropriate conversion semantics in Metric Center
9. Backfill and validate definitionId
10. Stop writing metric
11. Remove observations.metric and dependent code
12. Normalize source identity
13. Audit projection-specific Observation metadata
14. Resolve Meal snapshot/component authority
15. Review duplicate Health Connect ingestion paths
16. Split oversized repositories/routes where it materially simplifies code
17. Delete dead compatibility code
18. Update documentation
19. Run full validation suite
```

Keep migrations staged and reviewable.

Do not combine unrelated schema cleanup into the Journal refactor unless required.

---

# Validation

Before considering the work complete, run the repository's existing:

```text
format checks
lint
type checking
unit tests
integration tests
E2E tests where available
database/migration validation
production build
```

Also manually verify:

```text
quick add
Journal rendering
Journal edit/delete
meal creation/editing
daily metrics
trends
goals
unit conversion
Metric Center lookups
Health Connect ingestion if locally testable
```

---

# Completion criteria

The refactor is complete when all of these are true:

```text
Journal cannot be directly created, edited, or deleted as persisted state.

Creating something visible in Journal creates canonical data.

Editing something visible in Journal mutates canonical data.

Deleting something visible in Journal mutates canonical data.

No frontend flow writes both Journal and Observation representations.

Journal can be recreated entirely from Observations.

Daily metrics and other projections can be recreated from canonical inputs.

External Source records feed Observations rather than acting as application read models.

Reference/configuration entities remain independently mutable where appropriate.

Every mutating endpoint clearly targets Observation, Source record,
or Reference/configuration data.

Projection mutation exists only internally for materialization/rebuilding,
never as a domain command.

Every Observation has a valid definitionId.

definitionId is the sole canonical Observation identity.

No canonical Observation contains metric.

The observations.metric database column and related indexes are removed.

Metric semantics and unit conversions resolve through Metric Center.

Meal nutrient components use definitionId.

Health Connect derivation produces definition-backed Observations.

Journal, metrics, trends and goals identify Observations through definitionId.
```

The final architecture should be easy to explain:

```text
                    Metric Center
                         │
                    definitions
                         │
                         ▼
                 ┌──────────────────┐
Manual commands ─▶   Observations    │
                 └─────────┬────────┘
                           │
External source            │
      │                    │
      ▼                    │
┌──────────────┐           │
│ Source record│───────────┘
└──────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           Journal      Metrics       Trends
              │            │            │
              └────── projections ──────┘
```

Keep the implementation simpler than the diagram.

The architecture should be enforced primarily through clear ownership, one canonical Observation identity, centralized metric semantics, and deletion of invalid write paths—not through additional infrastructure.
