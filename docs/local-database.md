# Local database

A local Supabase stack, so a migration is rehearsed before it reaches production.

Until this existed, `npx supabase db push --linked` was the *first* time a
migration ran anywhere. The point of the local stack is that the first run
happens somewhere disposable.

## Start it

Requires Docker Desktop running.

```bash
npx supabase start
```

The stack is already configured in `supabase/config.toml` — notably
`major_version = 17`, which must keep matching production, or the rehearsal
proves nothing. Check production with `SHOW server_version;` if you ever suspect
drift.

Useful URLs once it is up:

| What | URL |
|---|---|
| Studio (browse tables) | http://127.0.0.1:54323 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| API | http://127.0.0.1:54321 |

Stop it with `npx supabase stop`. Add `--no-backup` to discard the volume.

## Replay every migration from scratch

```bash
npx supabase db reset
```

This drops the database and applies `supabase/migrations/*.sql` in filename
order. It is the cheap check, and it catches ordering mistakes and syntax errors
— but note what it does **not** catch: it applies everything to an *empty*
database, and production is not empty.

## Rehearse against existing rows

The failure modes that actually bite — a new `NOT NULL` column with no default, a
`CHECK` that existing rows violate, a foreign key pointing at data that does not
satisfy it — only appear when the migration meets real rows. Rehearse like this:

1. Move the new migration out of `supabase/migrations/` temporarily.
2. `npx supabase db reset` — the database now matches production's schema.
3. Insert representative rows, including the awkward ones: archived records,
   completed items, `NULL`s in columns the migration touches.
4. Apply the migration on its own and time it:
   ```bash
   docker exec -i supabase_db_HealthyFlow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q < path/to/migration.sql
   ```
5. Check the seeded rows survived and were given sane defaults.
6. Apply it a **second** time. Migrations here are written with `IF NOT EXISTS`
   and `DO $$` constraint guards specifically so a half-finished `db push` can be
   retried; re-running is how you prove that.
7. Move the migration back and `npx supabase db reset` to leave a clean state.

Also worth asserting explicitly, because getting them backwards is silent and
permanent: what each `ON DELETE` rule does. Delete the parent row and look at
what happened to the children.

## Then push

```bash
npx supabase db push --linked
```

## Known gap

The local stack has no production data, so it cannot tell you how long a
migration will hold a lock on a large table. For that you need a restored dump
in a separate project — see the discussion of a staging environment before
attempting anything that rewrites a big table.
