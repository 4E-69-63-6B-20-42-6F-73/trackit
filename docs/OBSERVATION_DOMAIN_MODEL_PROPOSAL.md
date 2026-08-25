# TrackIt observation-centered domain model proposal

Status: accepted direction; Phase 1 derived-observation cache foundation implemented  
Review date: 2026-08-25

### Implementation checkpoint — 2026-08-25

The first vertical slice is now implemented:

- Effective base-series resolution is a distinct domain operation from derivation.
- System-derived observations are materialized in a rebuildable cache, separate from authoritative base observations.
- Every cached derived observation records its algorithm version, source-resolution version, timezone, deterministic input fingerprint, and ordered input lineage.
- Daily projection rebuilds replace derived cache rows atomically, including explicit empty-day materialization through `daily_projection_runs`.
- Bounded derived-only reads use the cache only when every covered local date has a current, complete, non-dirty materialization. Cache misses and invalid versions fall back to calculation from effective base observations.
- Retention and owner deletion remove applicable derived materializations without deleting or mutating raw source records.

Still pending are the broader schema generalization for non-numeric and compound observations, migration of meals into observations, and replacement of persisted Journal entries with a projection. Those remain later phases so that their one-time content migrations can be validated independently.

## 1. Decision summary

TrackIt should adopt one product-domain source of truth:

> Observations represent what TrackIt knows; projections show it, intentions evaluate against it, and insights interpret it.

The proposed model makes the following explicit decisions:

1. **Journal is a projection, not a saved entity.** There should be no independently editable `journal_entry` fact. A Journal item is rendered from an underlying observation or compound observation.
2. **Meals are observations, not a parallel saved entity.** A meal is a compound observation. Foods and recipes remain reusable definitions; consumption of them becomes part of the observation graph.
3. **Every user fact has one authoritative write path.** Manual logging, external imports, and derivations all produce observations with different provenance. Quick Add must not dual-write a journal entry and a measurement.
4. **Compound events stay together.** A meal, sleep session, blood-pressure reading, symptom episode, or body-composition reading has a root observation and related component observations.
5. **Derived facts remain inspectable.** BMI, nutrient totals, calorie balance, and other derivations carry algorithm version and lineage to their input observations.
6. **Raw external evidence remains intact.** Connector payloads may be retained as immutable source records for replay, auditing, and exact-import idempotency, but they are an ingestion concern rather than a second product fact model.
7. **Effective-series selection is a projection.** Source disabling, exact deduplication, overlap resolution, and user priority determine which observations contribute without deleting the originals.
8. **Missing is not zero.** Absence, an explicit zero, an excluded observation, an unresolved conflict, and an incomplete compound observation are distinct states.

## 2. Product principles translated into architecture

| Product principle                                  | Domain consequence                                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today = where am I?                                | Today is a date-and-timezone projection combining current observations, summaries, active intentions, and carefully selected context. It owns no health facts. |
| Journal = what happened?                           | Journal is a chronological projection of meaningful root observations. It does not persist titles or details independently from those observations.            |
| Trends = what changed?                             | Trends queries effective numeric observation series and projection summaries. It must retain drill-through to contributing observations.                       |
| Keep configuration separate                        | Units, source-resolution rules, visible cards, and saved views remain preferences or projection configuration, never observation fields.                       |
| Observations are the foundation, not the interface | Screens use familiar view models such as Meal, Sleep session, or Weight reading, produced from observations rather than mirroring storage rows.                |
| Prioritize clarity over density                    | Compound roots prevent a meal or blood-pressure reading from becoming several unrelated Journal cards. Components appear on expansion.                         |
| Make everything trustworthy and inspectable        | Every displayed value can expose origin, effective time, original value, resolution state, and derivation lineage on demand.                                   |
| Turn data into understanding                       | Projections summarize facts; Insights interpret evidence and must reference their observations, method, window, and uncertainty.                               |

## 3. Existing domain model catalog

### 3.1 Persisted product data

| Current entity                                                                         | Current role                                                                                                       | Authority today                     | Main problem                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `observations`                                                                         | Numeric metric readings with canonical/original values, timestamps, source metadata, and partial derivation fields | Authoritative for metrics           | Numeric-only shape cannot represent notes or compound events. Provenance is split between columns, JSON metadata, `sources`, and `health_records`.                                   |
| `health_records`                                                                       | Canonicalized external Health Connect envelopes and payloads                                                       | Authoritative import evidence       | Correctly supports external identity and replay, but its relationship to product observations is implementation-specific and epoch envelope timestamps can differ from sample times. |
| `meals`                                                                                | Logged meal header and nutrient snapshot                                                                           | Authoritative for nutrition logging | Parallel fact model. Nutrients are converted into transient synthetic observations at read time.                                                                                     |
| `meal_items`                                                                           | Food snapshot and grams belonging to a meal                                                                        | Authoritative meal composition      | Tied to the parallel meal aggregate and not part of general observation lineage.                                                                                                     |
| `journal_entries`                                                                      | Human-readable timeline entries, manual notes, and links to meals/observations/health records                      | Independently writable authority    | Duplicates facts and presentation. Titles/details can diverge from linked entities. Deletion must manually cascade to a linked fact.                                                 |
| `daily_metrics`                                                                        | Materialized effective daily metric values                                                                         | Projection/cache                    | Correct category, but naming does not make projection status explicit and it stores one aggregate per metric/day without contributor lineage.                                        |
| `daily_projection_runs` / `projection_dirty_dates`                                     | Materialization completeness and invalidation queue                                                                | Projection operations               | Useful foundation, currently specialized to daily metrics rather than a common projection contract.                                                                                  |
| `goals`                                                                                | Generalized metric target, aggregation, comparator, period, and active schedule                                    | Intention                           | Sound direction, but it is the only first-class intention and contains a legacy target column.                                                                                       |
| `saved_trend_views`                                                                    | User configuration for Trends                                                                                      | Projection configuration            | Correctly not an observation; naming should remain clearly configuration-oriented.                                                                                                   |
| `foods`, `recipes`, `recipe_items`                                                     | Reusable nutrition reference data                                                                                  | Definitions                         | Correct domain category. Historical consumption must reference a definition revision or retain a snapshot.                                                                           |
| `preferences`                                                                          | Display units, source resolution, locale/timezone, and experience configuration                                    | Configuration                       | Combines several preference families in JSON, but is conceptually separate from observations as required.                                                                            |
| `sources`, `devices`, `sync_cursors`, `device_upload_batches`, `device_request_nonces` | Connector and ingestion operations                                                                                 | Integration state                   | `sources` does not fully normalize connector instance versus originating provider; provider strings are repeated in observation metadata.                                            |
| retention, backup, authentication, audit, MCP, and ownership tables                    | Operational/security concerns                                                                                      | Operational authority               | These are not health-domain entities and should remain outside the observation model while referencing it consistently.                                                              |

### 3.2 Existing in-code models

TrackIt currently has overlapping definition and fact vocabularies:

- `src/domain/health.ts` defines the client-facing numeric `Observation`.
- `src/domain/metricCatalog.ts` is the main UI metric registry and includes units, display preferences, aggregation, goals, source type, and derived-metric declarations.
- `server/health-records/metric-registry.ts` is a second metric registry used during Health Connect derivation. It differs in categories, supported metrics, aggregation vocabulary, units, and precision. For example, Height is `cm` in the UI registry and `m` in the Health Connect registry.
- `server/health-records/types.ts` defines canonical source records and `DerivedObservation`, but its `kind` distinguishes only `raw_metric` from `derived_metric` and does not model manual facts or compounds.
- `server/journal/types.ts` defines an independently creatable and editable Journal entity with presentation fields.
- `src/domain/types.ts` exposes `JournalEvent`, including an optional nested numeric observation, coupling the logging UI to the current dual-write flow.
- `src/domain/effectiveMetrics.ts` resolves source overlap and produces non-persisted meal nutrient and system-derived observations.
- `src/domain/goals.ts` evaluates intentions against numeric observations.

### 3.3 Current write journeys

#### Quick Add

```text
User logs Weight / Water / Energy / Symptom
        |
        +--> POST journal entry (first authority)
        |
        +--> asynchronously POST numeric observation
                 failure leaves "journal safe, measurement missing"
```

Notes and descriptive meals may exist only as journal entries. Numeric logs may exist twice in different shapes.

#### Food logging

```text
Food or recipe definition
        ↓
Persist meal + nutrient snapshot
        ↓
Persist linked Journal row
        ↓
Generate transient nutrient observations during effective-series reads
        ↓
Daily nutrition separately reads meals and sums snapshots in React
```

This produces three representations of one user action and lets Today/Trends/Goals and Nutrition reach the same fact through different paths.

#### Health Connect

```text
Immutable external source record
        ↓
One or more numeric observations
        ↓
Selected record types also create persisted Journal rows
        ↓
Effective resolution and daily projections
```

The canonical source-record layer is valuable. The persisted Journal copy is not.

### 3.4 Current read journeys

| Surface        | Current sources                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today          | Daily metric projections, bounded effective observations, goal evaluations, and separately fetched journal entries and meals                                 |
| Journal        | Persisted `journal_entries`, then client-side search, date grouping, source filtering, and special-case merging of Weight + Body fat into “Body composition” |
| Nutrition      | Persisted meals and meal snapshots; daily totals are recalculated in the client                                                                              |
| Trends         | Daily projections for availability plus effective observations for charting and inspection                                                                   |
| Goals          | Effective numeric observations evaluated by the centralized goal engine                                                                                      |
| Metrics Center | Registry plus distinct observation origins and preference configuration                                                                                      |
| Export         | Separate collections for journal, observations, meals, health records, and daily projections                                                                 |

### 3.5 Consequences of the current model

1. **Dual-write inconsistency is a supported state.** A Journal row can succeed while its linked observation fails.
2. **Journal presentation is treated as truth.** Editing a title or detail does not necessarily edit the underlying fact.
3. **Nutrition has two calculation paths.** Effective-series nutrient observations and client-side meal summation can drift.
4. **Compound events are reconstructed heuristically.** Journal currently combines Weight and Body fat by matching title, source, and a 60-second window.
5. **Provenance is fragmented.** Connector, provider, device, source label, external identity, and original values live in several places.
6. **Definition metadata is duplicated.** The client and Health Connect registries can disagree on canonical units and aggregation.
7. **Retention is entity-oriented rather than fact-oriented.** Separate observation, meal, and journal rules require linked deletion and projection invalidation logic.
8. **The export exposes implementation collections rather than one coherent history.** Consumers must understand how meals, journals, and observations overlap.

## 4. Proposed ubiquitous language

### Observation

A fact about the user that happened, was measured, logged, imported, or derived. Every observation has:

- a stable identity;
- an observation type;
- an effective instant or interval;
- an optional typed value;
- an origin: `manual`, `external`, or `derived`;
- provenance appropriate to that origin;
- lifecycle state;
- optional relationships to other observations;
- a schema/definition version.

An observation is not necessarily a metric. A note, symptom episode, meal, and exercise session are observations even when they do not have one numeric value.

### Observation definition

Versioned metadata describing a supported fact type: familiar name, category, value kind, canonical unit, aggregation behavior, compound roles, manual logging schema, Journal presentation, goal capabilities, and optional derivation rule.

“Metric definition” becomes the numeric subset of observation definitions rather than a competing registry.

### Compound observation

A meaningful event represented by one root observation and related component observations. The root supplies identity, timing, provenance, and presentation context. Components remain independently queryable where useful but do not become unrelated Journal items.

### Source record

Immutable external evidence received from a connector. It preserves connector, provider/origin, external identity/version, original payload, and import timestamps. A source record may produce zero, one, or many normalized observations.

Source records support replay and exact-import idempotency. They sit outside the product fact stream: they are evidence used to create observations, not peers of manual observations and not inputs consumed directly by Today, Journal, Trends, Goals, or Insights.

### Definition

Reusable reference data, including observation definitions, units, foods, recipes, and revisions of those objects.

### Intention

Something the user wants to achieve, remember, repeat, or investigate: goal, reminder, routine, or experiment. Intentions reference observation definitions and evaluate observations; they do not own measurements.

### Projection

A reproducible read model derived from observations, preferences, and intentions. Today, Journal, Trends, daily summaries, effective metric series, nutrition totals, and goal progress are projections.

### Insight

An evidence-backed interpretation over observations. It references evidence, evaluation window, method/version, strength, limitations, and user lifecycle state. An Insight is not itself a health fact.

## 5. Proposed observation model

The conceptual model should be independent of React and of the eventual SQL layout:

```ts
type ObservationOrigin = 'manual' | 'external' | 'derived'
type ObservationState = 'active' | 'excluded' | 'superseded' | 'deleted'

type ObservationValue =
    | {
          kind: 'quantity'
          canonicalValue: number
          canonicalUnit: UnitId
          original?: OriginalQuantity
      }
    | { kind: 'number'; value: number }
    | { kind: 'score'; value: number; scale: { min: number; max: number } }
    | { kind: 'code'; code: string; display?: string }
    | { kind: 'text'; text: string }
    | { kind: 'boolean'; value: boolean }
    | null // valid for a compound/event root

type Observation = {
    id: ObservationId
    definitionId: ObservationDefinitionId
    definitionVersion: number
    effective: { start: Instant; end?: Instant }
    recordedAt: Instant
    value: ObservationValue
    origin: ObservationOrigin
    provenance: ObservationProvenance
    state: ObservationState
    attributes: Record<string, JsonValue>
    version: number
}
```

### 5.1 Provenance

Provenance is structured and origin-specific:

```ts
type ObservationProvenance =
    | {
          origin: 'manual'
          actorId: UserId
          entrySurface: 'quick_add' | 'nutrition' | 'journal' | 'api' | 'assistant'
      }
    | {
          origin: 'external'
          sourceRecordId: SourceRecordId
          connectorInstanceId: ConnectorInstanceId
          providerId: ProviderId
          externalRecordId: string
      }
    | {
          origin: 'derived'
          derivationId: DerivationDefinitionId
          derivationVersion: number
          calculatedAt: Instant
      }
```

`provider` and `connector` remain separate. “Fitbit via Health Connect” is represented directly rather than reconstructed from JSON strings.

### 5.2 Observation relationships

Relationships make compounds and derivations explicit:

```ts
type ObservationRelationKind = 'component_of' | 'derived_from' | 'supersedes' | 'correction_of'

type ObservationRelation = {
    fromObservationId: ObservationId
    toObservationId: ObservationId
    kind: ObservationRelationKind
    role?: string
    ordinal?: number
}
```

Deduplication decisions should not be encoded as destructive relationships. They belong to an effective-series projection with an inspectable resolution explanation.

### 5.3 Observation definition

One registry should serve ingestion, logging, formatting, goals, Journal presentation, Trends, and derivation:

```ts
type ObservationDefinition = {
    id: string
    version: number
    name: string
    category: string
    occurrence: 'measurement' | 'event' | 'session' | 'compound'
    value: ValueDefinition
    aggregation?: AggregationDefinition
    display?: DisplayDefinition
    manualLogging?: ManualLoggingDefinition
    goalCapabilities?: GoalCapabilities
    journalPresentation: 'root' | 'component' | 'hidden'
    compound?: { allowedRoles: readonly string[] }
    derivation?: DerivationDefinition
}
```

This replaces both the UI metric catalog and server Health Connect metric registry. Connector-specific record mappings remain integration adapters that target registry definitions.

## 6. Compound observation examples

### 6.1 Meal

```text
Meal observation (root)
  type: meal
  effective time: 12:35
  origin: manual
  attributes: meal type = Lunch, quality = complete
        |
        +-- component_of <- Food consumed: Greek yoghurt, 200 g
        +-- component_of <- Food consumed: Berries, 80 g
        |
        +-- derived_from <- Calories, 260 kcal
        +-- derived_from <- Protein, 24 g
        +-- derived_from <- Carbohydrates, 31 g
        +-- derived_from <- Fat, 5 g
```

Foods and recipes remain definitions. A consumed-food observation references the definition revision and keeps the historical name, amount, and nutrient basis needed for reproducibility. If nutrition is unknown, nutrient observations are absent—not zero.

Journal renders one Meal card. Nutrition and Trends query the derived nutrient observations. Editing the meal changes the underlying observation graph and invalidates affected projections.

### 6.2 Blood pressure

```text
Blood pressure reading (root)
        +-- Systolic 120 mmHg     role: systolic
        +-- Diastolic 78 mmHg     role: diastolic
```

Journal shows one blood-pressure event. Trends can query either numeric component. The pairing is structural, never inferred from close timestamps.

### 6.3 Sleep session

```text
Sleep session (root interval: 23:14–07:03)
        +-- Total sleep 7.3 h
        +-- Deep sleep 1.2 h
        +-- REM sleep 1.6 h
        +-- stage/session components where supported
```

Journal shows one session attributed using one centralized sleep-day rule. Trends and goals query the appropriate components.

### 6.4 Body composition

```text
Body composition reading (root)
        +-- Weight 80.0 kg
        +-- Body fat 18.2%
        +-- BMI 24.7 (derived from Weight + effective Height)
```

The current Journal heuristic that combines nearby Weight and Body fat rows becomes unnecessary.

### 6.5 Symptom and note

A symptom episode is a root observation with a coded or textual symptom, severity score, optional duration, note, and tags. A freeform note is a text observation. Both appear in Journal because their definitions opt into Journal presentation; neither requires a separate Journal table.

## 7. Derived observations

Derived observations are first-class in the domain even when calculated on demand or cached:

- They have deterministic identity based on derivation definition/version and input identities.
- They reference all direct inputs with `derived_from` relationships.
- They use the same canonical units and formatting registry as other observations.
- They are recomputed or invalidated when inputs, source-resolution preferences, definition revisions, or derivation versions change.
- Their inspection view explains the formula, version, input values, effective time, and whether any inputs were estimated or incomplete.
- They are never imported back as raw facts merely to make screens simpler.

BMI and calorie balance remain the initial system derivations. Meal nutrient totals become derived observations from consumed-food components rather than synthetic rows created only during reads.

## 8. Effective observation series

The canonical pipeline has one domain boundary. Manual input becomes an observation directly; external input first becomes an immutable source record and is then normalized into observations. Downstream consumers see observations only:

```text
Manual entry ------> validation ------------> base observation(s)
External payload --> immutable source record --> normalization --> base observation(s)
                                                                     |
                                                                     v
                                                       Base observation graph
                                                                     |
                                                                     v
                                                   Identity safeguards
                                                                     |
                                                                     v
                                            Provider-aware overlap grouping
                                                                     |
                                                                     v
                                   Per-definition source policy and priority
                                                                     |
                                                                     v
                                              Effective base observations
                                                                     |
                                                                     v
                                           Derived observations with lineage
                                                                     |
                                                                     v
                            Journal / Today / Trends / Nutrition / Goals
                                                                     |
                                                                     v
                                           Evidence-backed Insights
```

Exact external replay is rejected or upserted at the source-record boundary. Observation identity constraints provide a second idempotency guard during normalization. Overlap resolution happens only after inputs have become observations.

Resolution output should be inspectable:

```ts
type EffectiveObservationDecision = {
    observationId: ObservationId
    contributes: boolean
    reason: 'included' | 'source_disabled' | 'exact_replay' | 'lower_priority_overlap'
    competingObservationIds?: ObservationId[]
    policyVersion: number
}
```

Raw and excluded observations remain available through detail/provenance views and export. Normal product consumers request effective observations by default.

## 9. Projections

### 9.1 Journal projection

Journal should query meaningful root observations and produce a view model:

```ts
type JournalItem = {
    observationId: ObservationId
    effective: EffectivePeriod
    category: string
    title: string
    summary: string
    sourceSummary: string
    icon?: string
    componentCount: number
    inspectable: boolean
    editable: boolean
}
```

Rules:

- Presentation comes from the observation definition plus observation values.
- Root observations render once; components and derivations are summarized inside the item.
- Passive high-frequency samples may be hidden or summarized by definition policy without being deleted.
- Search indexes observation text, definition labels, provider labels, tags, and selected component summaries.
- Edit opens the underlying observation editor.
- Delete/correct changes the underlying observation graph, not a Journal row.
- Duplicate creates a new manual observation graph with new identities and preserved definition references.
- Source and derivation detail are progressively disclosed.

### 9.2 Today projection

Today answers “where am I?” for one configured timezone day:

- latest relevant measurements;
- cumulative effective totals;
- meaningful sessions/events;
- active intention status;
- comparison with an explicit baseline;
- clear missing, partial, estimated, and zero states.

It consumes the same effective observation service and materialized summaries as other surfaces.

### 9.3 Trends projection

Trends answers “what changed?” by projecting numeric observations or numeric components using definition-controlled aggregation. Every point exposes contributor identities and coverage. Saved views remain projection configuration, not facts.

### 9.4 Daily summaries and materialization

Daily summaries remain caches. The future materialization model should record:

- projection type and key;
- owner and calendar/timezone boundary;
- input watermark or dependency version;
- observation-definition version;
- source-resolution version;
- derivation version;
- status: pending, complete, failed, or stale;
- contributor count and optional contributor identity digest;
- completion and failure diagnostics.

## 10. Intentions

Use one intention family with kind-specific configuration:

```ts
type Intention = GoalIntention | ReminderIntention | RoutineIntention | ExperimentIntention
```

Existing generalized Goals are the starting implementation. An intention references observation definition IDs and explicit evaluation semantics. Schedule/effective dates belong to the intention, while aggregation periods remain evaluation configuration.

Routines should no longer live only inside experience-preference JSON once promoted to domain behavior. Experiments should describe a question, active window, expected observation types, and evaluation plan without manufacturing conclusions.

## 11. Insights

An Insight is an interpretation, not an observation and not generic UI copy:

```ts
type Insight = {
    id: InsightId
    kind: string
    statement: string
    evidenceObservationIds: ObservationId[]
    window: EffectivePeriod
    method: string
    methodVersion: number
    strength?: number
    limitations: string[]
    generatedAt: Instant
    state: 'active' | 'dismissed' | 'expired'
}
```

Insights must distinguish association from causation, disclose sparse or incomplete evidence, and let the user inspect the observations behind the statement.

## 12. Suggested persistence shape

This is a target shape, not a migration to implement now.

### Core product tables

| Table                                                             | Purpose                                                                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `observation_definitions` or code-owned versioned registry        | Stable observation type and behavior definitions. System definitions may remain code-owned if versions are persisted with observations. |
| `observations`                                                    | Common fact header, effective interval, typed value, origin, lifecycle state, attributes, and optimistic version.                       |
| `observation_relations`                                           | Compound membership, lineage, correction, and supersession links.                                                                       |
| `source_records`                                                  | Immutable connector/provider payload, external identity/version, and import metadata. Evolved from `health_records`.                    |
| `connector_instances`                                             | Paired integration/device through which data arrived.                                                                                   |
| `providers`                                                       | Originating application/device/provider identity, separate from connector.                                                              |
| `foods`, `food_revisions`, `recipes`, `recipe_revisions`          | Reusable definitions and reproducible historical nutrition inputs.                                                                      |
| `intentions` plus kind-specific configuration                     | Goals, reminders, routines, and experiments.                                                                                            |
| `projection_materializations` and projection-specific read models | Journal search, daily summaries, goal evaluations, and other rebuildable projections.                                                   |
| `insights` and `insight_evidence`                                 | Optional persisted interpretations and evidence links.                                                                                  |

### Observation value persistence

Two viable SQL strategies should be prototyped before migration:

1. **Typed columns on `observations`:** value kind plus nullable numeric, text, code, boolean, canonical unit, original value, and scale fields. This offers direct indexed metric queries and database constraints at the cost of sparse columns.
2. **Header plus `observation_values`:** one root header and one or more typed value rows. This is more flexible but makes every simple metric query join another table.

The recommended starting point is typed columns on `observations` with compound structure expressed through relationships. Most queried components are then ordinary scalar observations; compound roots have `null` value.

Avoid storing the complete domain object only as JSONB. JSON attributes are appropriate for type-specific optional metadata, not identity, time, numeric value, unit, provenance, state, or lineage.

## 13. Target API boundaries

The API should expose journey-oriented read models while retaining an observation command/query core:

### Commands

- `POST /api/observations` — create a simple or compound manual observation atomically.
- `PATCH /api/observations/:id` — correct the underlying root/value or replace components under optimistic concurrency.
- `DELETE /api/observations/:id` — soft-delete a root and its owned manual/derived components according to explicit lifecycle rules.
- External ingestion writes source records and normalized observations through an integration service, not the generic browser command.

### Queries

- `GET /api/observations` — bounded effective observations by default; raw/resolution detail available only through an explicit inspection scope.
- `GET /api/observations/:id` — complete compound graph, provenance, lineage, and resolution explanation.
- `GET /api/journal` — Journal projection; read-only as a projection.
- `GET /api/today?date=...` — cohesive Today projection rather than several client-orchestrated calls where practical.
- `GET /api/trends` or bounded series endpoints — projection points with contributor/coverage metadata.
- `GET /api/nutrition` — meal-oriented projection over observation graphs, not a meal repository.

There should be no `POST`, `PATCH`, or `DELETE /api/journal` after migration. Journal UI actions target observation commands.

## 14. Lifecycle and correction semantics

- Manual facts may be edited through optimistic concurrency. Material changes should preserve correction history through versioning or `correction_of`/`supersedes` relationships where auditability matters.
- External observations are corrected by newer source-record versions. Users may exclude them from effective projections but should not rewrite provider evidence.
- Derived observations are not manually editable. Correct their inputs or update the derivation implementation.
- Deleting a compound manual root deletes or supersedes owned manual components and invalidates derived descendants and projections.
- Retention targets observation origin/type and source-record payload separately. Removing raw external payload may be allowed after normalized facts are retained, but that policy must explicitly state the loss of replay capability.
- Projection rows are always disposable and rebuildable.
- Export emits definitions, observations, relationships, provenance/source records, intentions, and preferences without duplicate Journal and Meal truth collections. A compatibility export can provide legacy projections temporarily.

## 15. Migration strategy for a future refactor

No migration should begin until the target types, invariants, and representative fixtures are approved.

### Phase 0 — Contract and fixture design

- Approve the observation value algebra and compound ownership rules.
- Choose code-owned versus database-owned observation definitions.
- Build representative fixtures for manual weight, water, note, symptom, described meal, food-backed meal, sleep, blood pressure, body composition, Health Connect samples, BMI, and calorie balance.
- Define stable IDs and lineage expectations for derived observations.

### Phase 1 — One definition registry

- Merge the UI metric catalog and Health Connect metric registry into versioned observation definitions.
- Keep connector record mappings in adapters.
- Add contract tests ensuring canonical units and aggregation semantics agree end to end.

### Phase 2 — Expand observations without changing screens

- Add origin, value kind, normalized provenance references, state, recorded time, definition version, and observation relationships.
- Continue reading legacy tables through compatibility adapters.
- Preserve existing numeric observation IDs.

### Phase 3 — Migrate meals into compound observations

- Create one root observation per meal using the existing meal ID where feasible.
- Convert meal items into food-consumption component observations.
- Generate nutrient observations from stored snapshots with explicit lineage and quality.
- Validate per-day nutrient totals against the legacy meal path before switching reads.

### Phase 4 — Replace Journal persistence with projection

- Convert unlinked notes/check-ins into manual text, score, symptom, or event observations.
- Map linked Journal rows to their existing underlying observation/meal/source record without creating duplicates.
- Compare the new Journal projection with legacy fixtures and production snapshots.
- Switch Journal to read-only projection queries; route edit/delete/duplicate actions to observation commands.
- Retire Journal mutation endpoints, then remove `journal_entries` after a rollback window.

### Phase 5 — Switch every consumer

- Nutrition reads meal observation projections.
- Today consumes one effective observation/projection boundary.
- Trends and Goals consume the same numeric/component series.
- MCP and export use the observation model and journey projections.
- Remove transient `mealMetricObservations` and client-side meal nutrient summation.

### Phase 6 — Retire legacy storage

- Stop dual writes first.
- Verify counts, totals, lineage, source policies, and calendar boundaries.
- Archive or remove `meals`, `meal_items`, and `journal_entries` only after deterministic migration and rollback validation.
- Version the export format and retain a documented legacy importer if required.

## 16. Migration invariants

The future refactor must prove:

1. Every legacy manual Journal-only note/check-in becomes exactly one observation.
2. Every linked Journal row maps to one root observation and is not duplicated.
3. Every meal retains name, type, effective time, nutrition quality, food/recipe snapshots, nutrients, favorite/recent behavior where still product-relevant, and version history.
4. Daily nutrient totals before and after migration match, with missing nutrients remaining missing rather than zero.
5. External connector, provider, external identity/version, original value/unit, and raw payload lineage are preserved.
6. Source disabling and overlap policies produce the same or intentionally documented effective series.
7. Compound events render once in Journal and retain individually trendable components.
8. Derived BMI and calorie balance retain stable, inspectable input lineage.
9. Goal evaluation results match for equivalent effective observations.
10. All timestamps use explicit instants and one configured timezone for calendar projections.
11. Legacy IDs are preserved where possible; otherwise an auditable ID mapping is retained.
12. Projection deletion or rebuilding never deletes source observations.

## 17. Open decisions requiring approval

1. **Typed value storage:** sparse typed columns versus a separate values table.
2. **Definition ownership:** system definitions entirely in code with version IDs, persisted definitions, or a hybrid.
3. **Correction history:** immutable replacement observations for every edit versus versioned mutable manual observations with audit events.
4. **Compound ownership:** whether components may belong to multiple roots; recommendation is one owning root plus unrestricted derivation lineage.
5. **Derived persistence:** calculate on demand with cache versus materialized derived observation rows. Recommendation is one logical domain contract with optional rebuildable materialization.
6. **Food revisions:** explicit revision tables versus immutable snapshots embedded in food-consumption observations.
7. **Favorite meals:** preference/definition concept, saved meal template, or a property of the logged occurrence. Recommendation is a reusable meal template/definition, not a property of historical observations.
8. **Journal inclusion policy:** exact default list of passive versus meaningful observation definitions.
9. **Insight persistence:** persist generated statements for acknowledgement/history or regenerate them as projections while persisting only dismissals.
10. **Legacy export duration:** how long to offer separate `journal` and `meals` compatibility collections.

## 18. Recommended next design deliverables

Before writing a migration:

1. Produce TypeScript contracts for Observation, ObservationDefinition, ObservationRelation, SourceRecord, Intention, and projection view models.
2. Model the representative fixtures listed in Phase 0 and review whether they remain natural to query and present.
3. Prototype the two SQL value-storage options against production-like volumes, especially high-frequency steps and heart-rate records.
4. Specify Journal projection rules for every current record type and manual logger kind.
5. Specify meal editing, definition revision, nutrient quality, and recalculation behavior.
6. Define API compatibility and rollout telemetry.
7. Only then write the schema migration and implementation plan.

## 19. Proposed target flow

```text
Manual entry ------> validation ------------> base observation(s)
External provider --> source record --> normalization --> base observation(s)
                                                           |
                                                           v
                                                 Observation graph
                                            fact + time + provenance
                                              components + lineage
                                                           |
                                                           v
                                                 Effective resolution
                                                           |
                                                           v
                                               Derived observations
                                                           |
                                                           v
                                            Rebuildable projections
                                          /          |           \
                                         v           v            v
                                      Today       Journal       Trends
                                   where am I?  what happened?  what changed?
                                          \          |           /
                                           +---------+----------+
                                                     |
                                                     v
                                         Intentions evaluate facts
                                         Insights interpret evidence
```

This model preserves the familiar TrackIt experience while removing Journal and Meal as competing stores of truth. Users see meals, sleep, symptoms, measurements, and notes; the system sees one inspectable graph of observations.
