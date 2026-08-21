# Data lifecycle, export, backup, and restore

## Portable exports

Settings and Connections provide JSON and CSV downloads. JSON exports use schema
`net.trackit.export`, version `1`, and include the export time plus journal entries, observations,
meal nutrient snapshots, foods, recipes, preferences, effective-dated goals, saved trend views, and
source/provenance records.
CSV version 1 contains `collection` and `record` columns; `record` is the corresponding JSON object.
Future incompatible shapes increment `version` while importers continue accepting supported older
versions.

## Encrypted backups

Backups use `pg_dump --format=custom` followed by authenticated AES-256-GCM encryption. The archive
contains its format marker, random nonce, authentication tag, and ciphertext—never the encryption
key. Generate and store the key outside the backup volume:

```bash
openssl rand -base64 32
```

Set `TRACKIT_BACKUP_KEY` and `TRACKIT_BACKUPS_ENABLED=true` before `npm start`. Settings shows the
latest successful/failed run and can validate that an archive decrypts and passes `pg_restore
--list`.

## Clean restore

Stop TrackIt, place the encrypted archive in its configured backup directory, provide the same
external key and database URL, then run:

```bash
npm run backup:restore -- trackit-2026-08-20T12-00-00-000Z.dump.enc
```

The command decrypts to a mode-0600 temporary file, runs `pg_restore --clean --if-exists`, deletes
the temporary file, applies all newer migrations, and records the completed clean-restore check in
the restored installation's backup status. Always restore into an isolated clean
environment first and verify owner login, record counts, and the latest journal date before using
it as production.

## Retention and deletion

Retention rules apply independently to observations, meals, and journal entries. Immediate category
deletion hard-deletes live records and writes only a non-sensitive audit fact. Full owner deletion
removes health/nutrition data, devices, machine credentials, sessions, preferences, and prior audit
history, retaining only the fact that the local installation was erased.

When an observation or meal has a linked Journal representation, category retention and immediate
deletion remove that representation too. This prevents a title or value summary from surviving the
deletion of its underlying health record.

Health Connect source deletions are applied as permanent-version soft-deletion tombstones because
Health Connect deletion events provide an ID but no modification version. They stop appearing in
application and MCP reads immediately, prevent replayed upserts from resurrecting deleted data, and
are hard-deleted when observation retention applies, with observations-category deletion, or with
full owner deletion.

Category and full-owner deletion also purge every encrypted archive in TrackIt's configured local
backup destination, because an archive cannot be selectively rewritten safely. Copies moved to an
external destination are outside TrackIt's control and must be removed by that destination's
operator. Destroy the external backup key and create a new one if immediate cryptographic erasure of
all independently copied archives is required.
