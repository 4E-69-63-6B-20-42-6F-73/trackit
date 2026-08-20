# TrackIt

A privacy-first, self-hosted health and nutrition dashboard.

## Current prototype

The first frontend vertical slice includes responsive Today, Journal, Trends,
Connections, and Settings experiences, plus an interactive quick-add flow. It
uses React, TypeScript, Vite, Mantine, Tabler Icons, and Recharts.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

The product and architecture proposal is in `docs/PRODUCT_DESIGN.md`.

## Current boundaries

This is an interaction prototype backed by representative local data. Database,
authentication, MCP, and Android Health Connect synchronization are the next
implementation layer.
