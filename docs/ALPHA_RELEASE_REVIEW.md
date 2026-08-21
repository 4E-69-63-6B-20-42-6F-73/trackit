# Alpha release critical review

Status: implementation-complete; environment release gates still require execution.

## Executive assessment

TrackIt is suitable for a private alpha with technically confident self-hosters. It now has a
coherent daily workflow, safe journal editing, useful empty states, first-class goals, nutrition,
trends, Health Connect ingestion, scoped MCP access, authentication, export, and recovery tooling.
Its strongest qualities are data ownership, restrained presentation, honest missing-data handling,
and unusually serious operational foundations for an alpha.

It is not appropriate for an unsupported public release yet. Installation, Android pairing,
reverse-proxy security, database recovery, and external integrations still need validation on the
exact release artifacts. The app must continue to avoid diagnostic or prescriptive health claims.

## UI and UX review

### Strengths

- Today prioritizes one daily action and separates missing input from setup work.
- Empty states explain what is absent, what will appear, and what action resolves the state.
- Nutrition makes logging and reuse primary while keeping administration secondary.
- Trends supports the full metric catalog, explains missing coverage, and labels normalized
  cross-unit comparisons.
- Journal mutations have confirmation, undo, duplicate protection, editing, deletion, and useful
  provenance.
- Goals have a dedicated destination, focused creation form, active/history separation, full state
  feedback, and support for multiple schedules with deterministic overlap handling.
- Navigation uses real links, visible focus, a skip link, route focus management, native controls,
  and Mantine dialog focus trapping.

### Resolved action points

1. Move Goals to `/goals`, redirect the old URL, and expose it in desktop/mobile navigation.
2. Replace the dense Goals settings form with a responsive create-and-review layout, the complete
   metric catalog, useful defaults, schedules, history, state feedback, and retirement.
3. Allow multiple scheduled goals while applying the most recently effective matching goal to
   Today when schedules overlap.
4. Remove the hard-coded account identity from the sidebar.
5. Use semantic links for primary and Settings navigation, moving focus to main content after route
   changes while preserving first-load skip-link behavior.
6. Extend keyboard focus coverage to text areas and native selects, with browser tests for keyboard
   route activation and focus placement.
7. Repair the remaining corrupted punctuation in user/developer-facing copy.

## Feature review

The core loop is complete: collect or import data, log subjective and nutrition records, review
Today, compare trends, manage goals, inspect provenance, and export or recover the dataset. The
fixed nutrient schema is adequate for macro-focused alpha use, including sugar, saturated fat,
sodium, and potassium. Arbitrary vitamins and minerals need an extensible model, not more fixed
columns.

Goals currently model a numeric target, not “at least,” “at most,” or a range. The UI calls them
targets and does not provide clinical recommendations. Direction and ranges are a post-alpha model
enhancement; presenting them without end-to-end progress semantics would be misleading.

Health integration is through the Android Health Connect companion, not direct Google Fit cloud
integration. MCP is advanced, disabled-by-default functionality and remains outside the primary
consumer journey.

## Accessibility and keyboard review

Interactive controls are native elements or Mantine primitives. Navigation uses anchors, forms
submit with Enter, dialogs trap and restore focus, the skip link bypasses repeated navigation, and
route activation focuses the main region. Automated WCAG checks cover every primary route, but do
not replace manual screen-reader, zoom, switch-control, and high-contrast testing.

## Alpha release readiness

### Implemented gates

- Formatting, lint, TypeScript, tests, production bundle budget, secret scanning, responsive
  browser checks, and automated WCAG scans.
- Versioned migrations, authenticated APIs, CSRF/security headers, scoped MCP access, export and
  deletion, encrypted backups, and documented restore operations.
- Loading, empty, partial, success, error, duplicate, conflict, and retry states in critical flows.

### Release-time gates

- Build and scan the final multi-architecture container.
- Migrate production-like PostgreSQL data and complete a clean restore drill.
- Build/sign Android and verify pairing plus Health Connect sync on supported physical devices.
- Test the documented reverse proxy and HTTPS configuration on the intended host.
- Run manual keyboard, screen-reader, 200%/400% zoom, and high-contrast checks in the package.
- Confirm checksums, upgrade notes, backup-key custody, and rollback criteria before tagging.

These are verification obligations, not open implementation tasks. A failure reopens its owning
feature before an alpha tag is published.

## Deferred opportunities

- Directional/ranged goals with migration-safe historical semantics.
- Extensible micronutrients, barcode scanning, and optional public food databases.
- iOS HealthKit, OIDC, household accounts, localization, and custom metrics.
- Clinically reviewed insights. TrackIt must not infer diagnosis, causation, or medical targets from
  sparse self-tracking data.

No implementation-critical action from this review remains open. Remaining work is either an
explicit post-alpha expansion or a release-environment verification gate.
