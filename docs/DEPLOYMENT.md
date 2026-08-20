# Secure self-hosting

TrackIt must be exposed over HTTPS. The production server marks authentication and CSRF cookies
as `Secure`, `HttpOnly` where appropriate, and `SameSite=Strict`. Terminate TLS at a maintained
reverse proxy such as Caddy, nginx, or Traefik and forward requests to TrackIt only over a trusted
private network.

## Caddy example

```caddyfile
trackit.example.net {
    reverse_proxy app:3000
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

## Required proxy behavior

- Preserve `Host`, `X-Forwarded-Proto`, and the client address.
- Redirect HTTP to HTTPS.
- Do not cache `/api`, `/mcp`, authentication responses, or exports.
- Limit request bodies and connection rates at the edge.
- Back up PostgreSQL separately from the application container.

After deployment, verify `/api/health`, owner setup, logout, passkey registration, and a new browser
login before importing health data.
