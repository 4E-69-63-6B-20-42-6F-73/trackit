# Data export and deletion

TrackIt provides explicit data export and deliberate user-initiated deletion. It does not create,
schedule, retain, verify, or restore application-managed backups, and it does not automatically
delete user data.

## Export

The owner can download a portable versioned snapshot from Connections in JSON or CSV format.
Exports include canonical Observations, Journal projections, foods, recipes, goals, preferences,
sources, and relevant configuration. Export is read-only and does not alter live data.

## Category deletion

Settings → Privacy & data supports deliberate deletion of:

- health measurements;
- meals and nutrition observations;
- check-ins and notes.

Category deletion removes the selected canonical Observations and invalidates affected projections.
Foods and recipes remain when meal history is deleted.

## Delete all owner data

The owner must type `DELETE ALL TRACKIT DATA` before deleting all installation data. The command
removes owner data, authentication state, integrations, observations, projections, reference data,
and audit history from the live TrackIt database.

Infrastructure operators remain responsible for any database snapshots or storage copies created
outside TrackIt. Those copies are not visible to or managed by the application.
