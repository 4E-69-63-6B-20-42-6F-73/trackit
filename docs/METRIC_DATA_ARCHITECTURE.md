# Metric and observation architecture

## Core model

TrackIt has one canonical application fact model: **Observations**.

```text
Plan intent ------------------------> manual capture -> Observations
Manual capture -------------------------------------> Observations
External source -> source records ------------------> Observations

Observations + configuration -----------------------> projections
```

Commands may mutate observations, plan intent, source records, and reference/configuration data.
Queries read observations, plan intent, and projections. Product projections do not have domain
commands.

Journal, Today, Trends, daily metrics, and goal progress are read models over observations and
configuration. Plan items are dated user intent rather than health facts. Foods, recipes, goals,
metric definitions, source configuration, and saved trend views are reference/configuration data.

## Planning intent

Plan items describe what the owner intends to do. They are directly editable command-model data and
must not be represented as observations or projections before the planned action actually happens.
A plan item may reference domain-specific configuration, such as a food or recipe for a planned meal.

Fulfilling a planned meal is a capture command. It atomically creates the canonical compound meal
observation and links that observation to the plan item. The visible `logged` state is derived from
that active linked observation. If the observation is deleted, the plan must not remain a competing
record that claims the meal happened.

Skipping, moving, editing, or deleting a plan item changes intent only and does not affect health
metrics, Journal, Trends, or goal evaluation.

## Definition identity

`definitionId` is the canonical semantic identity of an observation. Metric Center owns the numeric
semantics associated with metric definitions, including:

- canonical unit;
- supported display/input units;
- conversion behavior;
- formatting precision;
- supported aggregation/comparison behavior;
- source-resolution configuration where applicable.

The same observation-definition mechanism also covers non-numeric facts such as meals, notes, and
events. Symptom severity is a numeric metric definition with canonical unit `score` and a valid range
of 1–10; the symptom name remains observation context rather than a second metric identity.

A second stored `metric` identity must not be introduced. Projections and goal/trend configuration
should reference definition identity.

## Source records and provenance

Imported provider records are retained as source records for idempotency, provider fidelity,
tombstones, traceability, and re-derivation. They are ingestion evidence, not a competing application
truth model.

```text
Health Connect record
      ↓
source record
      ↓
normalized observation(s)
```

Application consumers do not query raw provider records as an alternative health history. Source
resolution selects the effective observation series without destroying imported evidence.

## Compound observations

A meaningful compound event has one root observation and related component observations. Meals use
this pattern: the meal is a root observation and nutrient values are definition-backed numeric
components connected through observation relations. Foods and recipes remain reusable reference data.

Meal logging is therefore a specialized manual Observation capture flow, not a parallel canonical
Meal store.

## Derived observations and projections

System-derived values are rebuildable. Materialized derived observations and daily projection tables
exist to make reads efficient, but they do not become an additional command model.

Daily projection materialization is versioned, timezone-aware, and replaceable. Dirty-date state
tracks projection work after canonical mutations. Projection failure must never require deleting
source records or canonical observations.

## Effective numeric series

Numeric consumers use one effective-series resolution path:

```text
canonical numeric observations
    -> source enablement / exact deduplication / overlap policy
    -> effective observations
    -> derived calculations
    -> projections and consumers
```

Today, Goals, Trends, Metric Center source summaries, MCP metric reads, and daily materialization must
agree on the same resolution semantics.

## Product mapping

```text
Plan
    Meals -> dated intent + library references; logging -> observations

Capture
    Log -> observations
    Health Connect -> source records -> observations

Understand
    Today -> projection + relevant plan intent
    Journal -> projection
    Trends -> projection
    Goals -> goal configuration + progress projection

Library
    Foods -> reference data
    Recipes -> reference data
    Metric Center -> observation/metric definition configuration

Connections
    Health Connect / devices -> ingestion configuration
    MCP -> scoped access configuration

Settings
    Profile -> timezone / locale
    Data -> export / delete
    Security -> authentication / sessions / recovery
```

## Invariants

1. Observation is the canonical health fact.
2. `definitionId` is its semantic identity.
3. Plan items are user intent and never contribute to health metrics until captured as observations.
4. A fulfilled plan item derives its logged state from an active linked observation.
5. Source records are ingestion evidence, not application truth.
6. Projections are rebuildable read models and do not have product commands.
7. Metric Center owns numeric units and conversions.
8. Meals are compound observations; foods and recipes are reference data.
9. Goal progress is derived from goal configuration plus observation/projection data.
10. Export and explicit deletion are supported; automatic retention and managed backups are not.
