# Secure self-hosting

TrackIt must be exposed over HTTPS. The production server marks authentication and CSRF cookies
as `Secure`, `HttpOnly` where appropriate, and `SameSite=Strict`. Terminate TLS at a maintained
reverse proxy such as Caddy, nginx, or Traefik and forward requests to TrackIt only over a trusted
private network.

## Caddy example

```caddyfile
trackit.example.net {
    reverse_proxy app:3000 {
        health_uri /api/ready
        lb_try_duration 15s
        lb_try_interval 250ms
    }
    encode zstd gzip
}
```

Set DNS to the reverse proxy, keep PostgreSQL off the public network, and set `TRACKIT_ORIGIN` in
the Compose `.env` file to the exact public HTTPS origin (`WEB_ORIGIN` when running the server
without Compose). The `app` hostname in the example assumes Caddy shares the Compose network; use
the host address and published `TRACKIT_PORT` otherwise. Do not disable certificate validation for
browser or Android clients.

Set `TRACKIT_TRUST_PROXY=true` only when direct access to the app port is blocked and every request
comes through that trusted proxy. This lets TrackIt use the forwarded client address for session
history and rate limiting; leaving it false prevents direct clients from spoofing those headers.
For private certificate authorities, install the CA certificate on every client instead.

Browser-based MCP clients need an explicit cross-origin grant. In TrackIt, open **Settings →
Connections → Assistant access**, add the client's exact HTTPS origin under **Browser client
origins**, and save. Changes apply immediately and do not require a server restart. Server-side MCP
clients do not need a browser-origin grant.

## Required proxy behavior

- Preserve `Host`, `X-Forwarded-Proto`, and the client address.
- Redirect HTTP to HTTPS.
- Do not cache `/api`, `/mcp`, authentication responses, or exports.
- Retry unavailable upstreams during the short single-instance replacement window. The Caddy
  example holds safe reads while the readiness check changes to the new process.
- Limit request bodies and connection rates at the edge.
- Back up PostgreSQL separately from the application container.

After deployment, verify `/api/health`, owner setup, logout, passkey registration, and a new browser
login before importing health data.

## Upgrade-safe browser assets

The runtime keeps content-addressed assets from recent releases in the `trackit-assets` volume.
This allows a browser that loaded the previous HTML document to finish a lazy import after an
upgrade. Assets older than 30 days are pruned at startup. If a proxy or browser still encounters an
obsolete chunk, the client performs one guarded refresh instead of entering a reload loop.

The deployment helper builds the candidate while the current container remains active, then
replaces it and waits for `/api/ready`. Configure the reverse proxy retry window shown above before
using in-place upgrades. A failed candidate remains a failed deployment and must not be exposed by
the proxy.
