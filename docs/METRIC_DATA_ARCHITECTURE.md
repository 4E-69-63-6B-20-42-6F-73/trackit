# Metric and observation architecture

## Core model

TrackIt has one canonical application fact model: **Observations**.

```text
Manual capture --------------------> Observations
External source -> source records -> Observations

Observations + configuration ------> projections
```

Commands may mutate observations, source records, and reference/configuration data. Queries read
observations and projections. Product projections do not have domain commands.

Journal, Today, Trends, daily metrics, and goal progress are read models over observations and
configuration. Foods, recipes, goals, metric definitions, source configuration, and saved trend
views are reference/configuration data rather than health facts.

## Definition identity

`definitionId` is the canonical semantic identity of an observation. Metric Center owns the numeric
semantics associated with metric definitions, including:

- canonical unit;
- supported display/input units;
- conversion behavior;
- formatting precision;
- supported aggregation/comparison behavior;
- source-resolution configuration where applicable.

The same observation-definition mechanism also covers non-numeric facts such as meals, notes,
symptoms, and events. Conversion simply does not apply to those definitions.

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
Capture
    Log -> observations
    Health Connect -> source records -> observations

Understand
    Today -> projection
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
3. Source records are ingestion evidence, not application truth.
4. Projections are rebuildable read models and do not have product commands.
5. Metric Center owns numeric units and conversions.
6. Meals are compound observations; foods and recipes are reference data.
7. Goal progress is derived from goal configuration plus observation/projection data.
8. Export and explicit deletion are supported; automatic retention and managed backups are not.
