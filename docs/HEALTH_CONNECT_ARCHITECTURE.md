# Health Connect data architecture

TrackIt preserves Health Connect records before calculating application metrics:

```text
Health Connect → Android adapters → health_records → observations → daily_metrics
```

- `health_records` is canonical. Source identity is `(user_id, provider, external_id)` and updates are accepted only when `external_version` increases. Payload and device JSON retain record-specific data and provenance.
- `observations` contains deterministic record projections. `source_record_id`, `derivation`, and `derivation_version` make every projection traceable and rebuildable.
- `daily_metrics` contains owner-timezone aggregates keyed by `definition_id` through the shared Metric Center. It is disposable and rebuilt from observations.
- Android ingestion uses `/api/device/health-records`, which preserves canonical source records before deterministic observation derivation.
- `POST /api/health-records/rebuild` replaces all source-linked projections from canonical records. It does not alter manually entered observations.

Android owns permission selection, reading, and faithful serialization only. The single `HealthRecordAdapterRegistry` drives supported record types, permissions, historical reads, change-token reads, and serialization. Formulas and aggregation policy remain on the server.

Deletion uses Health Connect source identity, tombstones `health_records`, removes its linked observations, and recomputes affected daily metrics. The deletion record type is descriptive only and is never used as identity.

Dense series such as heart-rate samples remain in `health_records.payload`; only summaries are projected into observations. Nutrition remains in TrackIt's nutrition model.

## Journal visibility

The Journal is a human-readable event timeline, not another canonical record store. It projects only meaningful sessions and intentional measurements:

- sleep and exercise sessions;
- weight and blood pressure;
- body fat, height, VO2 max, hydration, and lean body mass.

Passive interval and time-series records—including steps, heart-rate series, resting heart rate, HRV, oxygen saturation, respiratory rate, distance, calories, and basal metabolic rate—remain fully preserved in `health_records`, projected into `observations`, and aggregated into `daily_metrics`, but do not create Journal rows. This prevents high-frequency Health Connect records from overwhelming the Journal or its consumers.

Migration `0004_quiet_health_journal` soft-deletes older passive Journal projections. It does not delete canonical records or observations. A projection rebuild applies the same allowlist deterministically.

Record derivation lives in `derive.ts`. It emits `definitionId`, and its unit normalization calls the
shared Metric Center conversion rules. Rolling calculations live separately in `derive-window.ts`
and consume definition-backed `daily_metrics`, preventing cross-record policy from leaking into
source ingestion.
