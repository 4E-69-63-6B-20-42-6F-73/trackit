# Threat model

## Assets and boundaries

TrackIt protects health observations, meal and journal contents, owner credentials, sessions,
passkeys, device credentials, MCP grants, exports, and backup keys. Trust boundaries exist at the
browser/API cookie boundary, reverse proxy, PostgreSQL connection, MCP bearer endpoint, Android
pairing/upload endpoint, Health Connect, backup destination, and administrator shell.

## Primary threats and controls

| Threat                            | Control                                                                                                        | Residual risk / review check                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Unauthenticated health access     | Fail-closed API hook; owner setup; Argon2; passkeys; opaque sessions                                           | Static shell is public but contains no health payload                             |
| CSRF/session theft                | HttpOnly Secure Strict cookies, double-submit CSRF, HTTPS guidance, short endpoint scopes                      | Compromised same-origin script can act as owner; CSP and dependency review matter |
| Credential guessing               | Per-route and global rate limits; recovery codes are one-time hashed values                                    | Reverse proxy must preserve client IP and also rate-limit                         |
| Stored prompt injection           | MCP note content is marked untrusted data; tools never execute note instructions                               | Assistant clients must preserve the returned classification                       |
| Over-broad machine access         | MCP disabled by default; hashed expiring grants; category/date/tool scopes; quotas; audit                      | Owner must review active grants and last-used times                               |
| Unauthorized automation           | Separately named write scopes, idempotency receipts, meal previews, exact-target delete confirmations          | A legitimately authorized write client can create records within its grant        |
| Rogue Android device              | Five-minute one-use pairing; server identity verification; owner confirmation; keystore signatures; revocation | A compromised unlocked phone may use its valid device key                         |
| Sync duplication/deletion errors  | Source/external ID uniqueness, source versions, per-type cursors, idempotent batches, tombstones               | Health Connect retains its own platform constraints                               |
| Backup disclosure                 | AES-256-GCM, external key, mode-0600 temporary files, archive verification                                     | Host administrator and key holder remain trusted                                  |
| Sensitive logs                    | Structured logger redacts cookies, auth, tokens, credentials, passwords, and recovery codes                    | Operators must avoid enabling third-party request-body logging                    |
| Supply-chain/container compromise | Lockfile, production audit, secret scan, Trivy/Gitleaks CI, minimal Alpine runtime                             | Moderate development-only tooling findings are tracked                            |

## Security review checklist

- Confirm production uses HTTPS and a non-default database password.
- Confirm CSP, HSTS, frame, MIME, and referrer headers on the public origin.
- Exercise login throttling, CSRF rejection, logout-all, recovery-code reuse, and passkey counters.
- Verify a revoked MCP client and Android device fail on their next request.
- Verify MCP date/category/write grants with adversarial inputs and stored-note injection strings.
- Restore an encrypted archive into an isolated clean database using a separately retrieved key.
- Run production dependency, container, and secret scans; triage every high/critical result.
- Review audit records for sensitive payloads before release.
