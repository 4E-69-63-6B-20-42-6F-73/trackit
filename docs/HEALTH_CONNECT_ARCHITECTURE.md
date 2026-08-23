# Health Connect data architecture

TrackIt preserves Health Connect records before calculating application metrics:

```text
Health Connect → Android adapters → health_records → observations → daily_metrics
```

- `health_records` is canonical. Source identity is `(user_id, provider, external_id)` and updates are accepted only when `external_version` increases. Payload and device JSON retain record-specific data and provenance.
- `observations` contains deterministic record projections. `source_record_id`, `derivation`, and `derivation_version` make every projection traceable and rebuildable.
- `daily_metrics` contains UTC-date aggregates using the server metric registry. It is disposable and rebuilt alongside observations.
- Legacy `/api/device/upload` ingestion remains available for older companion builds. Current Android builds use `/api/device/health-records`.
- `POST /api/health-records/rebuild` replaces all source-linked projections from canonical records. It does not alter legacy or manually entered observations.

Android owns permission selection, reading, and faithful serialization only. The single `HealthRecordAdapterRegistry` drives supported record types, permissions, historical reads, change-token reads, and serialization. Formulas and aggregation policy remain on the server.

Deletion uses Health Connect source identity, tombstones `health_records`, removes its linked observations, and recomputes affected daily metrics. The deletion record type is descriptive only and is never used as identity.

Dense series such as heart-rate samples remain in `health_records.payload`; only summaries are projected into observations. Nutrition remains in TrackIt's nutrition model.

Record derivation lives in `derive.ts`. Rolling calculations live separately in `derive-window.ts`
and consume `daily_metrics`, preventing cross-record policy from leaking into source ingestion.
