# Iteration delivery evidence

This matrix maps the acceptance criteria in `ITERATION_PLAN.md` to maintained evidence. A release
is publishable only when both the local gates and the environment-dependent CI gates pass.

| Iteration | Delivered evidence                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–1       | Lazy bookmarkable routes, Mantine theme/providers, separated pages/components/hooks/domain adapters, Today/Journal/quick-add component tests, and the Playwright persistence flow. `npm run check` enforces formatting, lint, TypeScript, tests, production build, secret scanning, and the 500 KiB chunk budget.                                                                   |
| 2         | Fastify/OpenAPI API, PostgreSQL repositories, migrations `0000`–`0017`, optimistic Journal retry/conflict handling, provenance-preserving observations, idempotent UUID creation, legacy-storage import preview, and Compose startup. `server/postgres.integration.test.ts` runs against PostgreSQL in CI; migration tests preserve seeded historical data.                         |
| 3         | Owner setup, passkeys, recovery password/codes, secure sessions/CSRF/headers, independent login and recovery throttles, device/session controls, sign-out-all, privacy-safe audit targets, and HTTPS/proxy guidance. Auth and API policy tests cover the boundary.                                                                                                                  |
| 4         | Persistent foods, recency/favorite/exact ranking, gram/serving conversion, CSV import, recipes/yields, meal edit/copy/favorite/recent flows, immutable nutrient snapshots, visible nutrition quality, and actual Today totals. Nutrition calculation/repository tests and the desktop/mobile repeated-meal timing flow cover the acceptance criteria.                               |
| 5         | Canonical/original units, persisted display preferences, effective-dated scheduled goals, timezone-sensitive daily/weekly aggregation, missing/partial coverage, saved views, exact contributor inspection, outlier exclusion, deterministic baselines, and non-causal correlation context. Fixed datasets cover DST, contributors, conversions, and aggregation.                   |
| 6         | Official TypeScript MCP SDK endpoint, bounded resources/read tools, disabled-by-default endpoint, hashed expiring scoped clients, optional date grants, per-tool quotas, immediate revocation, attributable access-log UI, and untrusted-note classification. MCP service/contract tests cover scopes, dates, metadata, injection content, auditing, and revocation.                |
| 7         | Android 9+ Compose companion, Health Connect availability detection, QR pairing, server-identity verification, device-bound signing key, dual confirmation, one-time expiry, device management, and idempotent batches. Device service tests and the Android build gate cover pairing, upload retry, and revocation.                                                                |
| 8         | Just-in-time category permissions, cancellable 30-day paging, per-type cursors, foreground/background sync, partial statuses, expired-cursor recovery, monotonic source versions, permanent deletion tombstones, and source/data-origin provenance. Device and Android tests cover deduplication, deletion replay, travel, and DST-sensitive elapsed time.                          |
| 9         | AES-256-GCM scheduled backups, local destination abstraction, verify/restore commands, versioned JSON/CSV exports, retention/category/full deletion, backup purge, linked-record erasure, and restore diagnostics in Settings. CI restores five years of representative records into a clean database and verifies counts and status.                                               |
| 10        | Separate MCP write/delete scopes, meal preview confirmation, exact-target one-time deletion confirmation, idempotency receipts, quotas, immediate revocation checks, and visible `MCP: client` Journal provenance. MCP tests cover read/write separation, duplicate retry, token binding/consumption, and revoke-after-preview.                                                     |
| 11        | Desktop/mobile WCAG regression scans, keyboard bypass, 320 px reflow, Firefox/WebKit critical flow, throttled-phone interaction, five-year P95 tests, threat model/checklist, dependency/secret/runtime-container scans, migration/restore/rollback drills, operations/support docs, signed Android and multi-architecture OCI artifacts, runnable self-host bundle, and checksums. |

## Commands

Run locally:

```bash
npm run check
npm run security:deps
npm run test:e2e
npm run test:android
```

The CI and tagged-release workflows additionally run a real PostgreSQL integration test, apply all
migrations, execute `scripts/restore-drill.sh`, build and scan the runtime container, and block
publication if any gate fails. Docker and PostgreSQL command-line tools are therefore required to
reproduce those environment-dependent checks locally.
