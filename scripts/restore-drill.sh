#!/usr/bin/env bash
set -euo pipefail

readonly restore_url='postgres://trackit:trackit-ci@127.0.0.1:5432/trackit_restore'

psql "$DATABASE_URL" <<'SQL'
insert into preferences (id, display_name)
values ('owner', 'Restore proof')
on conflict (id) do update set display_name = excluded.display_name;

insert into observations (
    metric, canonical_value, canonical_unit, original_value, original_unit,
    observed_at, external_id
)
select
    'steps', 7000 + day, 'count', 7000 + day, 'count',
    timestamptz '2021-01-01 12:00:00+00' + day * interval '1 day',
    'restore-observation-' || day
from generate_series(0, 1824) as day
on conflict do nothing;

insert into journal_entries (
    category, title, detail, source_label, observed_at, external_id
)
select
    'Activity', 'Representative day ' || day, 'Five-year restore fixture',
    'CI restore drill',
    timestamptz '2021-01-01 12:00:00+00' + day * interval '1 day',
    'restore-journal-' || day
from generate_series(0, 1824) as day
on conflict do nothing;
SQL

archive=$(npm run --silent backup:create)
psql "$DATABASE_URL" -c 'create database trackit_restore'
DATABASE_URL="$restore_url" npm run backup:restore -- "$archive"

test "$(psql "$restore_url" -Atc "select display_name from preferences where id='owner'")" = "Restore proof"
test "$(psql "$restore_url" -Atc "select count(*) from observations where external_id like 'restore-observation-%'")" = "1825"
test "$(psql "$restore_url" -Atc "select count(*) from journal_entries where external_id like 'restore-journal-%'")" = "1825"
test "$(psql "$restore_url" -Atc "select count(*) from backup_runs where diagnostic = 'Clean restore completed and migrations applied' and verified_at is not null")" = "1"
