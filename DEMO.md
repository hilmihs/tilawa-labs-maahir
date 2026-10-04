# Demo build — Tilawa Labs (teacher competency platform)

This branch exists only to be deployed as a public demo. It must never be merged
back into `main`.

## What was removed, and why

| Change | Reason |
|---|---|
| `src/lib/seeds/{seed-itsnain,seed-maahir,seed-syaikh,seed-kelas-hits}.ts` replaced with stubs | **The serious one.** Those modules carry production rosters — real names paired with real WhatsApp numbers, 99 of them in total — and they are imported by a coordinator server action. On a deployment whose coordinator password is printed on the page, any visitor could have *run* them. Replacing the modules, rather than guarding the action, is what actually keeps the data out of the server bundle. Signatures are unchanged so the registry still type-checks. |
| `scripts/mei2026-matrix.json` deleted | Extracted from a real spreadsheet of named teachers and their scores. |
| `SUPERADMIN_WAS` and `ADMIN_WA` in `src/lib/constants.ts` | The production list names a real person and carries two real numbers. |
| `PROD_FALLBACK` in `src/lib/url.ts` | It falls back to the live host when `NEXT_PUBLIC_APP_URL` is missing, which would have put production links into every WhatsApp message the demo generates. |
| ~20 display strings across 13 files | Organisation names become "Tilawa Labs" / "Education Board". Field names, route slugs and the module name `maahir` stay: none is rendered. |

## What was added

| Addition | Purpose |
|---|---|
| `scripts/seed-demo.ts` | Synthetic data sized for what the demo is meant to show, in priority order: Matrix Skill Guru (three consecutive months, so ranking and movement have something to say), the monthly report, then the dashboards underneath. Deterministic — a nightly reset reproduces the same screenshots. |
| `src/components/PitaDemo.tsx` | Banner on every page: states the data is synthetic and prints the demo accounts. |

## Two changes that alter behaviour — read before trusting a screenshot

**`MATRIX_LIVE_ANCHOR` is pushed to `2099-01`** (production: `2026-06`). Any month
at or after the anchor is *recomputed* from attendance, class-monitor observations
and reprimands rather than read from the `matrix_rekap` snapshot. Seeding that whole
input chain convincingly is a bigger job than the screen it feeds, and a demo that
recomputes an empty chain renders a matrix of zeroes. So the demo reads snapshots.

The trap this hid: the first page load, before the anchor was moved, **recomputed
the current month and overwrote the seeded rows with zeroes**. If the matrix ever
reads 0.00 again, re-run the seed — something recomputed over it.

**`MAINTENANCE_MODE=off` is required.** The default is `auto` with a start date of
2026-07-13, so on any date after that every route returns 503 — including the home
page. A fresh deployment without this env looks completely broken.

## A fresh database is not equivalent to production

Three objects exist in production with no migration file, because they were created
through the admin SQL endpoint. `supabase/migrations` alone will not build a working
database:

- `api_client` — the whole table. Blocks `0081`, and the aborted transaction then
  takes every later migration with it.
- `koordinator.kehadiran_only` — blocks **login**, with the only clue a
  `[role-lookup]` line in the server log and a generic "wrong password" on screen.
- `koordinator_hits` — referenced by `0005` and `0009`, dropped again by `0023`.
  Harmless to skip.

`scripts/seed-demo.ts` does not create these. They were applied by hand against the
demo database; a second fresh deployment will need them again. The real fix belongs
on `main`: write the missing DDL as migrations.

## Before deploying — the seal

- `ADMIN_DB_API=off` — the admin SQL endpoint, which can write.
- `MAINTENANCE_MODE=off`, `NEXT_PUBLIC_DEMO=1`.
- `DATABASE_URL` points at the demo database and nothing else.
- `SESSION_SECRET` freshly generated — it signs the audio URLs.
- `NEXT_PUBLIC_APP_URL` set, so `url.ts` never reaches its fallback.

This app has **no WhatsApp gateway at all** — every notification is a `wa.me` link a
human clicks — so unlike the event app there is no outbound sender to stub.

## Accounts

Everything is `demo123`. Coordinator `6289900000001`, musyrif `6289900000002` and
`6289900000003`.
