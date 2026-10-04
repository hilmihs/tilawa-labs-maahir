# Maahir (demo build)

A Qur'an-memorisation submission and teacher-competency platform. Teachers and
class monitors record attendance and observations, participants submit recorded
recitation, examiners score it per indicator, and a monthly scoring matrix rolls
all of it into a per-teacher competency sheet. There is a public complaints
channel and a read-only public API for downstream dashboards.

This is a sanitised copy of a production app, published so it can be read.
Production data, rosters and names are gone, the organisation's identity is
replaced with neutral placeholders, and the seeds that carried real rosters are
replaced with stubs that refuse to run (`src/lib/seeds/seed-maahir.ts`). See
[`DEMO.md`](./DEMO.md) for exactly what was removed and why.

**Live demo:** https://tilawa-labs-maahir.vercel.app — password `demo123` for
every account; sign in as coordinator `6289900000001` or musyrif
`6289900000002`. Synthetic data, resets nightly. The banner at the top of every
page prints the same accounts (`src/components/PitaDemo.tsx`).

The codebase is written in Indonesian: domain terms, identifiers, comments and
UI strings. Field names and route slugs were deliberately left untranslated
during sanitisation.

## What it does

Each of these is a distinct subsystem with its own routes, library modules and
migrations:

- **Setoran** — participants submit recorded recitation; a *musyrif* (examiner)
  listens and scores it. Audio is recorded in-browser and uploaded through a
  server action.
- **HITS** — teacher discipline and competency: attendance check-in, class-monitor
  daily reports, violation categories, reprimands, *tabayyun* (a clarification
  round the teacher can answer before a violation counts), and multi-stage
  approval flows reached by tokenised links.
- **Matrix Skill Guru** — eleven scored indicators per teacher per month across
  three categories, with per-category and overall weighted averages, radar and
  trend charts, ranking, and Excel export.
- **Evaluasi Halaqah** — per-indicator reading assessment with printable A4
  report cards, a published/revoked lifecycle, and a QR authenticity-check page
  reachable without an account.
- **Kehadiran / Ketersediaan** — attendance recording, holiday requests,
  teaching-availability collection, eligibility rules and slot allocation.
- **Shakwa** — a public complaint and leave-request form (the only unauthenticated
  write path) plus a coordinator triage dashboard.
- **Public API** — `/api/v1/...`, bearer-key authenticated, read-only, 45
  declared entities.

Notifications are `wa.me` links a human taps. There is no WhatsApp gateway in
this codebase.

## Architecture

Next.js 14 App Router with TypeScript, `output: 'standalone'`, server components
and server actions doing nearly all of the data work; Tailwind with semantic
classes in `globals.css`; Recharts for charts. Authentication is custom —
identity is a WhatsApp number, passwords are bcrypt hashes, and the session is
an `iron-session` cookie that holds *a list* of role grants, because one person
is routinely a teacher in one halaqah and a class monitor in another
(`src/lib/session.ts`, `src/lib/roles.ts`). `src/middleware.ts` gates protected
path prefixes on cookie presence only, with explicit carve-outs for URLs already
printed on paper; the real authorisation happens per-page in the server
components. Data lives in PostgreSQL 17, reached directly through
`node-postgres` — there is no hosted backend, no PostgREST, and no ORM. Audio
lives on a filesystem path (`STORAGE_DIR`) and is served by `/api/audio/[...seg]`
behind an HMAC-signed URL. The whole app runs on one Postgres database plus one
writable directory.

## Three decisions worth reading the code for

### 1. Migrating off the hosted backend without touching the call sites

The app was originally built on a hosted Postgres backend and used its
JavaScript query-builder client everywhere. When the project hit a storage quota
and had to move to a plain Postgres server, the obvious cost was rewriting every
query. `db-migration/README.md` records the situation and the decision; the
migration note in `src/lib/pg-core.ts` puts the exposure at roughly 568 call
sites.

Instead of rewriting them, `src/lib/pg-shim.ts` (457 lines) reimplements the
subset of that query-builder API the app actually used, compiling chains to SQL:
`select` with `count`/`head`, `insert`/`update`/`upsert`/`delete` with
`RETURNING`, the filter operators, `order`/`limit`/`range`, `single`/`maybeSingle`,
and to-one embedded joins (`alias:fk_col(cols)`, recursive) which it turns into
correlated `to_jsonb` subqueries using a foreign-key map read from
`information_schema`. The builder is a thenable, so `await supabaseAdmin.from(…)`
keeps working unchanged, and it resolves `{ data, error, count, status }` rather
than rejecting — mirroring the client it replaced.

The half that is easy to miss is `src/lib/pg-core.ts`. Shaping the *API* was not
enough; the *values* had to match too. `node-postgres` returns `Date` objects for
dates and strings for `numeric`/`int8`, while the application code was written
against JSON from the old client — so code like `week_start.split('-')` would
have broken everywhere. Five global type parsers (OIDs 1082, 1114, 1184, 1700, 20)
realign the result types, and `encodeValue` handles the write direction for
json/jsonb/array columns.

**Unsupported operations fail loudly.** Where the shim does not implement
something, it throws with a message naming the shim and the offending input —
an unknown operator (`shim: operator PostgREST '…' belum didukung`), an embed it
cannot parse, a foreign key it cannot resolve. Those throws are caught by
`run()` and returned as `{ data: null, error: { message, code }, status: 400 }`,
which is the shape every call site already checks. The failure mode it refuses
to have is the dangerous one: a query that silently returns no rows and gets
read as "no data". `.rpc` is not on the client surface at all — `createPgClient`
returns only `from` — so calling it is an immediate `TypeError`.

Read it with the honest-limitations list in `db-migration/README.md` §8b, which
documents what is latent rather than fixed: `.or()` interpolates raw values and
will misparse anything containing `.`, `,` or `)`; embedded joins bypass the type
parsers, so a `timestamptz` selected through an embed would come back in a
different format; the shim does not reproduce the old 1000-row response cap, so a
large `select` without `.range()` now loads everything. One stale comment is
worth knowing about before you trust the header: `pg-shim.ts` lists `.or` as
unsupported, but `.or()` and `.not()` were implemented later
(`parseOrToken`, `pgrstPredicate`) and the header was never updated.

The same "shout, don't swallow" stance shows up in `src/lib/role-lookup.ts`,
whose docstring is the clearest single thing in the repo about why: a duplicate
role row made `.maybeSingle()` return an error that callers discarded, so a
teacher's role quietly vanished from their session until someone reported it by
hand.

### 2. The public API is a declaration, not a set of handlers

`src/app/api/v1/[...path]/route.ts` is one handler for all 45 entities. Each
entity is a row in `src/lib/api-public/registry.ts` declaring its table, its
scope, its exact allow-listed column list, its permitted filter parameters and
their kinds, and its default ordering. `src/lib/api-public/query.ts` rejects any
query parameter not declared, validates dates and booleans, and builds the query
through the shim.

Leak prevention is layered, on the assumption that any single layer will
eventually be got wrong:

- `FORBIDDEN_COLUMNS` in `registry.ts` lists what must never be exposed — password
  hashes, WhatsApp numbers (which *are* the login identity here), magic and access
  tokens, audio URLs, free-text feedback. `auditEntities()` runs at module load
  and throws if any entity names one, so a bad declaration fails at import rather
  than at request time.
- `src/lib/api-public/sanitize.ts` strips the same keys recursively from the
  response, in both snake_case and camelCase, after the query has run.
- Scope gating per key (`scopeAllows`), bearer keys stored as SHA-256 hashes with
  a 30-second verify cache, per-key rate and burst limits, an in-flight cap, and
  usage accrual flushed on a timer.
- `scripts/check-api-registry.ts` diffs the registry against the live
  `information_schema` before a deploy: every declared column must exist, no
  forbidden column may have crept in, and unknown new columns are reported.

One detail in `query.ts` is worth the ten seconds: pagination uses `OFFSET`, and
the default sort columns are frequently non-unique, so rows tied on the sort key
were not ordered consistently between pages — consumers silently lost and
duplicated rows while every page looked the correct size. A unique tie-breaker
column is now appended to every ordering unconditionally.

### 3. Null is not zero in the scoring engine

The matrix drives real consequences for real teachers, so `src/lib/matrix-compute.ts`
distinguishes "scored zero" from "not enough evidence to score". `stabilitasTo4()`
returns `null` below `STABILITAS_MIN_PERTEMUAN` meetings, because one rescheduled
meeting out of one is an event, not a pattern. `weightedAvg()` skips null parts
*together with their weights* and renormalises over what remains, returning
`null` if nothing is left — so a missing indicator dilutes nothing and invents
nothing. The comments record what the thresholds used to be and why they were
wrong: an absolute reprimand-count scale penalised teachers for teaching more
often, since more meetings meant more chances to cross a fixed count, and it was
replaced with a ratio on the same 0–4 scale every other indicator uses.

`src/lib/matrix-indicators.ts` is the single source of truth for the indicator
set — labels, categories, standards, weights, descriptions — consumed by the
coordinator table, the per-teacher page, the radar chart and the Excel export,
so no screen keeps its own hand-written list. Monthly results are snapshotted
into `matrix_rekap` and recomputation is idempotent and TTL-throttled rather than
run per page load (`syncMatrixIfStale`).

## Running locally

Requires Node 20+ and PostgreSQL 17.

```bash
npm install
cp .env.example .env.local     # DATABASE_URL, STORAGE_DIR, SESSION_SECRET, NEXT_PUBLIC_APP_URL
```

`SESSION_SECRET` must be at least 32 characters — `src/lib/session.ts` throws at
import otherwise — and it also signs the audio URLs. Set `MAINTENANCE_MODE=off`:
the default is `auto` with a start date in the past, and every route including
the home page returns 503 without it (`src/lib/maintenance.ts`).

Apply the schema. `db-migration/schema.sql` is a consolidated snapshot (59
`create table` statements) taken at the migration; `supabase/migrations/*.sql`
is the ordered history and is the newer of the two.

```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
npm run dev        # http://localhost:3000
```

```bash
npm run lint
npm run typecheck  # tsc --noEmit
npm run build      # next build + postbuild (assembles .next/standalone)
```

Three things about this published copy you should know before you try to boot it:

- **A fresh database is not equivalent to production.** `DEMO.md` records three
  database objects that exist in production but have no migration file, because
  they were created through the admin SQL endpoint: `api_client` (whose absence
  aborts migration `0081`, and the failed transaction then takes every later
  migration with it), `koordinator.kehadiran_only` (whose absence blocks login,
  with a generic "wrong password" on screen as the only symptom) and
  `koordinator_hits` (harmless to skip). Writing that missing DDL as migrations
  is the outstanding fix.
- **There is no test framework.** The convention is pure functions paired with
  standalone `tsx` scripts — `src/lib/evaluasi-dashboard.ts`,
  `ketersediaan-kelayakan-aturan.ts` and others carry comments naming the
  `scripts/test-*.ts` that exercises them, and `db-migration/README.md` §9
  describes verifying the shim and a full restore against PGlite (still present
  in `devDependencies`). Those scripts are not in this copy. `npm run typecheck`
  is the gate that is here.
- **Demo-only behaviour change.** `MATRIX_LIVE_ANCHOR` is pushed to `2099-01`, so
  every month is read from the `matrix_rekap` snapshot instead of being
  recomputed from attendance and observations. The recomputation path is in the
  code and is what production runs; the demo does not exercise it. The reasoning
  and the bug this hid are in `DEMO.md`.

## What to look at first

| Path | Why |
|---|---|
| `src/lib/pg-shim.ts` | The query-builder-to-SQL shim. Start at `run()`, then `buildSelectExprs` for the embedded-join compilation. |
| `src/lib/pg-core.ts` | Connection, foreign-key and column-type metadata, and the type parsers that made the migration invisible to call sites. |
| `db-migration/README.md` | Why the migration happened, how it was verified, and §8b: the limitations that were accepted rather than fixed. |
| `src/lib/api-public/registry.ts` | Declarative API surface and the load-time forbidden-column audit. |
| `src/app/api/v1/[...path]/route.ts` | One handler, 45 entities: auth, scope, rate limit, cache, sanitise. |
| `src/lib/matrix-compute.ts` | The scoring engine. `weightedAvg`, `stabilitasTo4`, `pctTo4` — and the comments explaining the scales that were replaced. |
| `src/lib/role-lookup.ts` | Short, and the best illustration of the error-handling stance in this codebase. |
| `src/lib/pg-storage.ts` | Filesystem replacement for the hosted object store, including HMAC-signed URLs and audio MIME sniffing from magic bytes (browsers lie about the container). |
| `src/middleware.ts` | Route protection, maintenance gate, and why two paths are carved out of it. |
| `src/app/hits/ketua/page.tsx` | A representative server-component page: session, authorisation, queries, render. |
| `DEMO.md` | What sanitising a production app for publication actually involves. |

## Repository size

Counted from the working tree, so you can reproduce them:

- 586 `.ts`/`.tsx` files, 106,889 lines, under `src/`
  (`find src \( -name '*.ts' -o -name '*.tsx' \) | wc -l`, then `-exec cat {} + | wc -l`)
- 119 `page.tsx` and 54 `route.ts` under `src/app/`
- 150 modules in `src/lib/`
- 91 SQL files in `supabase/migrations/`; 100 distinct table names created across them
- 1,091 query chains on `supabaseAdmin` across 216 files
  (`grep -rE 'supabaseAdmin[[:space:]]*$|supabaseAdmin\.from\(' src --include='*.ts' --include='*.tsx' | wc -l`)
  — the migration note recorded about 568 at the time of the cutover; the surface
  grew afterwards because the shim made continuing to use it free
- 45 entities in the public API registry; 11 indicators in `INDIKATOR`

No commit history is included in this copy, so there is nothing to count there.

## Notes

AI-assisted development: I used AI tools throughout, and the architecture,
the decisions described above and the debugging are mine.

Author: Ilham Kamila Anggraini — self-taught developer, open to roles in Malaysia,
the Gulf, and remote Europe.
