# Data export and deletion

TrackIt provides explicit data export and deliberate owner-initiated deletion. It does not create,
schedule, retain, verify, or restore application-managed backups, and it does not automatically
delete health history.

## Export

Settings → Data lets the owner download a portable snapshot in JSON or CSV format. Export is
read-only and does not alter live data.

The export is organized around TrackIt's current model:

- canonical observations;
- source records and source configuration needed for provenance;
- foods and recipes;
- goals and saved trend views;
- preferences and relevant configuration;
- rebuildable projection data when included for portability or diagnostics.

Journal and Today are projections and are not separate sources of health truth.

## Delete TrackIt data

The owner must type `DELETE ALL TRACKIT DATA` before deleting installation data. The command removes
owner health observations, source records, projections, reference data, integrations, authentication
state, and related application data from the live TrackIt database.

TrackIt intentionally does not expose separate retention policies or storage-domain deletion rules
for meals, notes, measurements, and other observation forms. They share the Observation model.

Infrastructure operators remain responsible for database snapshots or storage copies created outside
TrackIt. Those copies are not visible to or managed by the application.
