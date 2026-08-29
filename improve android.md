# Improve the TrackIt Android companion

## Goal

Make Android pairing reliable, keep Health Connect synchronization efficient and recoverable, and
raise confidence with contract-focused tests. The companion already has a sound canonical data
pipeline; the highest-value work is at the Android/server boundary.

## Implementation status

The roadmap changes are implemented:

- pairing remains pending until owner confirmation and uses the authenticated device-status contract;
- pairing responses expose identity mismatches consistently and have server contract tests;
- Health Connect cursors are scoped by device, while empty categories remain locally discoverable
  without generating server sync traffic;
- manual history no longer requires background-read permission;
- background work distinguishes authentication/permanent failures from transient retryable failures;
- the app records sync success/errors, supports secure local disconnect and deliberate server
  replacement, explains battery scheduling, requests notification permission, and uses readable
  category labels;
- request canonicalization, cursor isolation, empty-category reporting, failure classification,
  category registration, pairing routes, and device activation have automated coverage;
- the Gradle wrapper is executable, launch errors are visible, the Kotlin compiler uses the current
  DSL, and a debug APK builds successfully with the local JDK and Android SDK.

Physical-device verification remains appropriate for Health Connect permission screens, OEM battery
behavior, QR scanning, Android Keystore invalidation, and background execution timing because those
behaviors cannot be faithfully exercised by local JVM tests.

## Priority 0: repair pairing

### Do not treat a pending request as paired

The server responds to `POST /api/devices/pair/request` with HTTP 202, a device ID, and the one-time
credential while the device status is still `pending`. `PairingClient` currently classifies any 2xx
response containing those fields as success before its 202 branch can run. The app consequently
stores the credential and says it is ready even though uploads remain unauthorized until web
approval.

Change the flow to:

1. Submit the pairing request and retain the returned credential only in the in-progress pairing
   state.
2. Show the pending request in the web UI and wait for explicit owner approval.
3. Poll the authenticated status endpoint using the pending credential and key fingerprint.
4. Persist the server, device ID, and credential only after the server reports `confirmed`.
5. Treat rejection, expiry, and revocation as explicit terminal states.

### Align the status contract

The Android poller requests `GET /api/devices/{deviceId}/status`, but the server exposes
`GET /api/device/status`. The server endpoint requires a bearer credential and key fingerprint and
returns `{ data: { id, status, revokedAt } }`; Android currently sends neither credential nor
fingerprint and expects root-level `confirmed`, `credential`, and `serverIdentity` fields.

Define and test one shared response shape. The server stores only the credential hash, so Android
must retain the credential returned by the initial request while it polls.

## Priority 1: make synchronization safe and efficient

### Skip server synchronization for empty categories

An empty category still needs a local Health Connect change cursor; otherwise a record created later
would never be discovered. It does not need upload requests or server cursor-status writes.

The sync implementation should therefore:

- obtain and advance the Health Connect cursor locally for every selected category;
- send no upload or `syncing`/`complete` cursor calls when both the reread window and change feed are
  empty;
- begin server sync reporting only when the category produces at least one upsert or deletion;
- continue checking selected empty categories on later scheduled runs so future data is detected.

### Scope cursors to a pairing

Cursors are currently stored as `cursor:<recordType>`. Pairing with a different TrackIt server keeps
the old cursors, which can prevent the new server from receiving the initial 30-day baseline. Store
cursors under the server/device identity or clear them transactionally whenever the pairing changes.

### Classify background failures

`BackgroundSyncWorker` retries every exception. Retry transient network errors, HTTP 429, and server
5xx responses. Stop retrying authentication, revocation, invalid-request, permission, and corrupted
credential failures, and retain an actionable last-error state for the UI.

### Do not require background access for manual history

Historical upload runs as a foreground worker but currently requests background Health Connect
access. Request only the selected category permissions plus history access when importing more than
30 days. Background permission should remain optional and exclusive to scheduled sync.

## Priority 2: improve recovery and UX

- Add a connection screen showing server URL, verified identity, device state, last successful sync,
  last error, and category-level status.
- Add local disconnect/reset and an intentional “pair with another server” flow.
- Recover cleanly from an invalidated Android Keystore key instead of presenting the app as merely
  unpaired.
- Explain when background reads are unsupported, denied, or disabled by battery restrictions.
- Request notification permission where appropriate for foreground historical-upload progress on
  current Android versions.
- Use user-facing category labels rather than Kotlin class names.

## Priority 3: testing and build reliability

The Android module has only small tests for category isolation and time serialization. Add tests for:

- pending, approved, rejected, expired, and identity-mismatch pairing;
- Android/server request and response fixtures;
- request signing and canonical body hashing;
- encrypted credential storage and invalidated-key recovery;
- pairing-scoped cursor behavior;
- empty-category synchronization and later record discovery;
- change-token expiry, pagination, deletion tombstones, and retry classification;
- every Health Connect adapter and its server normalization contract;
- foreground and periodic worker outcomes;
- historical-import permission selection and restored progress.

CI should use a pinned compatible JDK and run unit tests plus `assembleDebug`.

## Existing strengths to preserve

- Android Keystore-backed credential encryption and EC request signing.
- HTTPS-only networking, disabled application backup, nonce protection, and body-bound signatures.
- Canonical source-record preservation before server-side projection and aggregation.
- Batched, idempotent uploads with retry handling and adaptive splitting after HTTP 413.
- Per-category permission isolation and cursor advancement only after successful uploads.
- Safe change-token expiry recovery, deletion tombstones, foreground historical work, progress, and
  cancellation.
- A single adapter registry for supported types, permissions, reads, and faithful serialization.

## Recommended delivery order

1. Pairing contract and automated pairing tests.
2. Pairing-scoped cursors and empty-category sync optimization.
3. Historical/background permission correction and retry classification.
4. Disconnect/recovery UX and sync diagnostics.
5. Adapter, worker, and end-to-end test coverage.
