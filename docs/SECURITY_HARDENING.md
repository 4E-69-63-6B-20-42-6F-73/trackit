# Security hardening compatibility notes

Schema migrations 0019–0021 introduce individual recovery-code rows, per-attempt WebAuthn
challenges, device request nonces, and explicit journal entity links. Migrations run automatically
at startup and backfill existing recovery codes and meal/measurement journal links.

New installations require `TRACKIT_DB_PASSWORD` and `TRACKIT_BOOTSTRAP_SECRET`. Published ports bind
to `127.0.0.1` unless `TRACKIT_BIND_ADDRESS` is explicitly set. The Proxmox installer generates both
secrets and explicitly enables LAN binding for a remote reverse proxy.

The first owner must enter `TRACKIT_BOOTSTRAP_SECRET` in the setup screen. Existing owners are not
asked for it. Passkey option responses now contain `{ attemptId, options }`, and verification accepts
`{ attemptId, response }`; old clients must update before passkey login or registration.

Android requests now send device ID, timestamp, nonce, and signature headers. The signature covers
the uppercase method, path, timestamp, nonce, SHA-256 body hash, and device ID separated by newlines.
Older companion builds must be upgraded before syncing.

Journal entries use independent IDs and optional `entityType`/`entityId` linkage. Callers must not
assume a meal or observation shares its UUID with its journal representation.

Backups retain the `TRKITB01` AES-256-GCM format. Creation now streams `pg_dump` into encryption and
never writes plaintext into the backup volume.
