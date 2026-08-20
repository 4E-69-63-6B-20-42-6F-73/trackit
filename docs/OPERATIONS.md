# Operations and support matrix

## Supported environment

| Component         | Supported baseline                                                      |
| ----------------- | ----------------------------------------------------------------------- |
| Container host    | Docker Engine/Desktop with Compose v2                                   |
| CPU               | amd64 or arm64                                                          |
| Browser           | Current and previous major Chrome, Edge, Firefox, or Safari             |
| Android companion | Android 9+; Health Connect app required below Android 14                |
| Database          | Bundled PostgreSQL 17; PostgreSQL 16 supported for external deployments |
| Reverse proxy     | Current Caddy, nginx, or Traefik with WebSocket/streaming HTTP support  |

## Install and upgrade

Copy `.env.example` to `.env`, replace the database password, set the public HTTPS origin, and run
`npm start`. Create and verify an encrypted backup before every upgrade. Pull the desired release,
review `CHANGELOG.md`, then run `npm start`; migrations run automatically before traffic is served.
Never downgrade the database schema in place. Roll back by stopping the stack, restoring the
pre-upgrade archive into a clean database, and starting the previous application image.

## Troubleshooting

- `{"error":"unauthorized"}` at `/api/*` is expected without a session. At `/`, rebuild the current
  image; the static login shell must load before authentication.
- `tsx` missing in a container means the image predates the runtime-dependency correction; rebuild
  without using the old app layer.
- A readiness failure usually means PostgreSQL is still starting or credentials differ between app
  and database containers. Use `docker compose ps` and `docker compose logs db app`.
- Passkeys require the browser origin to match `TRACKIT_ORIGIN` exactly and to use HTTPS outside
  localhost.
- Android rejects cleartext and invalid certificates intentionally. Install a private CA on the
  device instead of disabling validation.
- Backup failures surface in Settings. Confirm `TRACKIT_BACKUP_KEY`, write access to `/backups`, and
  available disk space.

## Release artifacts

Release builds publish a multi-architecture OCI container archive (amd64 and arm64) and signed
Android APK with SHA-256 checksum files. Keep the
Compose file, `.env.example`, migration directory, changelog, and support matrix alongside every
release. A release is not supported until clean install, previous-version upgrade, backup verify,
clean restore, accessibility, and five-year history tests pass.

The `trackit-<version>-selfhost.tar.gz` artifact contains the complete Docker build context. Unpack
it, copy `.env.example` to `.env`, configure the required values, and run `npm start`; no source
checkout is required. Verify every downloaded artifact against `SHA256SUMS` before use.

CI creates and restores five years of representative observations and Journal records, verifies
their counts and the recorded restore diagnostic, and scans the built runtime container for high
and critical vulnerabilities. The pre-upgrade backup plus clean-database restore is also the
supported application rollback drill; database schemas are never downgraded in place.

Tagged release builds require the protected `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` repository secrets.
The workflow fails rather than publishing an unsigned, non-installable companion. Preserve the
same signing key for every upgrade.

The production gate limits every uncompressed JavaScript chunk to 500 KiB. The current initial
chunk includes the shared React/Mantine shell; charts and route-specific features remain lazy-loaded.
