# TrackIt

A privacy-first, self-hosted health and nutrition dashboard.

## Start everything

With Docker Desktop or Docker Engine installed, one command starts PostgreSQL, applies migrations,
builds the web application, and runs the TrackIt API:

```bash
npm start
```

Open `http://localhost:3000`. The first visit guides you through owner setup.

## Local development

The first frontend vertical slice includes responsive Today, Journal, Trends,
Connections, and Settings experiences, plus an interactive quick-add flow. It
uses React, TypeScript, Vite, Mantine, Tabler Icons, and Recharts.

```bash
npm install
npm run dev
```

`npm run dev` starts the frontend only. If the API is not running, choose **Open local demo mode**
on the lock screen. To develop with persistent data, run PostgreSQL and `npm run dev:server`, or
start the complete stack below.

Production build:

```bash
npm run build
```

The equivalent Docker command is:

```bash
docker compose up --build
```

Production installations must use HTTPS. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
For a Proxmox VM or LXC deployment, follow [docs/PROXMOX.md](docs/PROXMOX.md); a fresh VM can create
its secrets and start the complete stack with one bootstrap command.
Backup, restore, export, retention, and deletion are documented in
[docs/DATA_LIFECYCLE.md](docs/DATA_LIFECYCLE.md).

Planning documents:

- `docs/PRODUCT_DESIGN.md` — product, UX, architecture, and security direction.
- `docs/ITERATION_PLAN.md` — implementation increments and acceptance criteria.

## Included capabilities

TrackIt includes PostgreSQL persistence, owner authentication, passkeys and recovery codes, a local
food/recipe catalog, meal snapshots, effective-dated goals, truthful trends, scoped and audited MCP
reads/writes, Android Health Connect synchronization, encrypted backups, portable exports,
retention, and verifiable deletion.

The Android companion supports Android 9 and newer. Health Connect is built into Android 14+ and is
a separate Google app on supported earlier versions. Download the companion artifact from a TrackIt
release, scan the short-lived pairing QR code under Connections, verify the displayed server
identity, and confirm the pending device in the web application.

For installation, upgrades, reverse proxies, backup and recovery, and troubleshooting, follow
[docs/OPERATIONS.md](docs/OPERATIONS.md). Security assumptions and the pre-release review checklist
are in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md). Requirement-to-test traceability is recorded in
[docs/DELIVERY_EVIDENCE.md](docs/DELIVERY_EVIDENCE.md).
