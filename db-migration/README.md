# Migrasi Database Maahir — Keluar dari Supabase

Panduan untuk memindahkan database aplikasi **Setoran Hafalan / HITS Maahir**
(`maahir.example.org`) dari Supabase ke host lain.

> Ditulis 13 Juli 2026, saat project Supabase `yvjbqrrczwvlsaqbjwrq` masuk status
> **restricted** (`exceed_storage_size_quota`) karena rekaman audio ~4.8 GB
> melewati kuota free tier. Data tabel sudah diamankan; audio perlu langkah
> tambahan (lihat bagian **Audio / Storage**).

---

## 0. Ringkas: arsitektur baru (PURE PostgreSQL)

Aplikasi **sudah dimigrasikan keluar dari Supabase**. Sekarang ia bicara
**langsung ke PostgreSQL** via `node-postgres` (`pg`), dan menyimpan **audio di
filesystem lokal**. **Tidak perlu Supabase, PostgREST, GoTrue, atau layanan
tambahan apa pun** — cukup PostgreSQL 17 + folder storage.

Ini dimungkinkan oleh shim di `src/lib/pg-shim.ts` yang meniru API query-builder
`supabase-js` (`.from().select().eq()...`) di atas SQL, sehingga ~568 call-site
aplikasi tidak berubah. Autentikasi login tetap custom (iron-session + bcrypt).

| Komponen           | Dipakai untuk                     | Perlu di target? |
|--------------------|-----------------------------------|------------------|
| PostgreSQL 17      | Semua data                        | **Ya** (satu-satunya) |
| Folder storage     | Simpan/serve rekaman audio        | Ya (kalau fitur audio dipakai) |
| PostgREST / Supabase / GoTrue | —                      | **Tidak** |

Yang perlu di-set di server (lihat bagian 5): `DATABASE_URL`, `STORAGE_DIR`,
`SESSION_SECRET`. Sudah diuji end-to-end: schema+data restore, login tiap role,
dan dashboard (termasuk join bertingkat + audio) berjalan di Postgres polos.

---

## 1. Isi paket backup

```
_backup_supabase/                 (TIDAK di-commit — berisi data sensitif)
  data/<tabel>.json               58 tabel, 26.277 baris — LENGKAP ✅
  storage-manifest.json           daftar 608 objek audio lama (referensi saja)
  manifest.json                   ringkasan + jumlah baris per tabel
  (audio ~4.8 GB TIDAK diikutkan — lihat bagian 4)

db-migration/                     (di-commit KECUALI dump)
  README.md                       file ini
  00_roles.sql                    buat role anon/authenticated/service_role
  schema.sql                      gabungan 44 migrasi (schema lengkap)
  load-data.ts                    muat data/*.json ke Postgres tujuan (butuh Node)
  maahir_full_dump.sql            ⭐ SATU file: roles+schema+data. Restore 1 perintah.
                                  TIDAK di-git (data sensitif) — dikirim bersama
                                  _backup_supabase, atau regen `npm run generate-dump`.
  docker-compose.yml              Postgres 17 lokal (untuk restore/test)

supabase/migrations/*.sql         44 migrasi asli (sumber schema, urut nomor)
scripts/export-supabase.ts        script export (re-run untuk lanjutkan audio)
scripts/test-restore-pglite.ts    verifikasi restore end-to-end (tanpa docker)
```

Status verifikasi:
- `npm run test-restore` **LULUS** — 44/44 migrasi apply, 58 tabel cocok manifest, 80 FK valid.
- `npm run test-shim` **LULUS** — 18 pola query aplikasi (embed 2-level, or/not, count/head, upsert).
- **End-to-end di Postgres polos**: login koordinator + dashboard (join bertingkat
  peserta→kelas→musyrif, daftar risiko, filter) render benar. Aplikasi jalan tanpa Supabase.

---

## 2. Restore database (langkah inti)

Berlaku untuk target apa pun (self-hosted Supabase, project Supabase baru, atau
Postgres polos). Butuh `psql` + `DATABASE_URL` ke Postgres 17 tujuan.

### Cara TERCEPAT — satu file (tanpa Node)

```bash
psql "$DATABASE_URL" -f db-migration/maahir_full_dump.sql
```

File ini = `00_roles.sql` + `schema.sql` + semua data (INSERT). Idempotent
(TRUNCATE dulu, load ulang). Sudah diverifikasi: restore ulang di Postgres bersih
menghasilkan jumlah baris persis sama dgn manifest. Kalau file belum ada, buat:
`npm run generate-dump` (butuh `_backup_supabase/data`).

> Butuh koneksi sbg superuser / role yg boleh `SET session_replication_role`
> (postgres default di self-hosted Supabase & project Supabase bisa). Kalau tidak,
> pakai cara bertahap di bawah.

### Cara bertahap (schema + loader Node)

```bash
# 1) Role Supabase (anon/authenticated/service_role) — dibutuhkan RLS policy.
psql "$DATABASE_URL" -f db-migration/00_roles.sql

# 2) Schema (enum, tabel, fungsi, trigger, RLS). Bisa pakai file gabungan:
psql "$DATABASE_URL" -f db-migration/schema.sql
#    ATAU jalankan migrasi satu per satu (identik):
#    for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# 3) Data (butuh Node + `npm i pg`). Loader mematikan trigger/FK saat load,
#    truncate dulu (buang baris seed migrasi), lalu insert dari JSON.
export DATABASE_URL   # postgres://user:pass@host:5432/db
npm run load-data
```

Verifikasi cepat setelah load:

```bash
psql "$DATABASE_URL" -c "SELECT
  (SELECT count(*) FROM peserta)   AS peserta,      -- 84
  (SELECT count(*) FROM setoran)   AS setoran,      -- 186
  (SELECT count(*) FROM audit_log) AS audit;"       -- 4432
```

Catatan:
- Tabel ad-hoc `_bak_merge_basmah_20260709` (87 baris) **tidak** dibuat oleh
  migrasi (backup manual lama). Datanya ada di `data/`; buat manual kalau perlu.
- RLS: server aplikasi pakai **service_role** (bypass RLS), jadi app tetap jalan
  walau policy belum sempurna. Policy tetap dibuat oleh schema.sql untuk anon key.

---

## 3. Menyiapkan PostgreSQL di server tujuan

1. Pasang **PostgreSQL 17** (paket resmi PGDG). Buat database, mis. `maahir`.
2. Restore schema + data (bagian 2 — cara tercepat: `psql -f maahir_full_dump.sql`).
   `00_roles.sql` membuat role `anon/authenticated/service_role` yang dipakai
   policy RLS; aman & idempotent di Postgres polos.
3. Sediakan folder storage audio (mis. `/var/www/html/maahir/storage`) dan taruh
   audio ke sana (bagian 4).
4. Set env `DATABASE_URL`, `STORAGE_DIR`, `SESSION_SECRET` (bagian 5).
5. Deploy, matikan maintenance (bagian 6). Selesai — tanpa Supabase/PostgREST.

> Tidak ada Docker wajib. `db-migration/docker-compose.yml` hanya opsi praktis
> kalau ingin Postgres 17 cepat via container.

---

## 4. Audio / Storage (filesystem)

Audio kini file biasa di disk: `${STORAGE_DIR}/setoran-audio/<path>`, diserve oleh
route `/api/audio/...` (signed URL HMAC `SESSION_SECRET`). Path objek sama seperti
yang tersimpan di tabel `rekaman`/`rekaman_musyrif`:
`{peserta_id}/{week_start}/{jenis}.webm` dan `musyrif/{musyrif_id}/.../{jenis}.webm`.

**KEPUTUSAN: audio lama (~4.8 GB) TIDAK dimigrasikan.** Saat export, project
Supabase sudah restricted (kuota storage 4.8 GB > 1 GB free) sehingga byte audio
tak bisa ditarik, dan diputuskan direlakan. Konsekuensi: tabel `rekaman`/`setoran`
tetap valid, hanya **playback rekaman lama yang mati** (file tidak ada di disk).
Setoran/rekaman BARU tetap berfungsi normal — tersimpan ke `${STORAGE_DIR}`.

Tidak ada yang perlu dilakukan untuk audio saat migrasi. Cukup pastikan folder
`${STORAGE_DIR}/setoran-audio/` ada & bisa ditulis oleh proses aplikasi.

> (Kalau suatu saat ingin menyelamatkan audio lama: lepas restriction Supabase
> lalu `npm run export-supabase` untuk resume unduhan, salin ke
> `${STORAGE_DIR}/setoran-audio/`. Daftar objek di `storage-manifest.json`.)

---

## 5. Env aplikasi

Di server (`/var/www/html/maahir`, env via Azure Variable Group `ENV_*` →
`env_vars.sh`). Ganti dari model Supabase lama ke:

```
DATABASE_URL=postgres://user:pass@localhost:5432/maahir   # Postgres tujuan
STORAGE_DIR=/var/www/html/maahir/storage                  # folder audio
SUPABASE_AUDIO_BUCKET=setoran-audio                        # nama subfolder (tetap)
SESSION_SECRET=<biarkan sama>       # ganti = semua sesi login logout + link audio lama mati
NEXT_PUBLIC_APP_URL=https://maahir.example.org
# PG_POOL_MAX opsional (default 10) — biarkan default utk Postgres asli.
```

Var lama `NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY`
**tidak dipakai lagi** oleh aplikasi (boleh dihapus). Kode aplikasi tidak perlu
disentuh — shim `pg` menangani semuanya.

---

## 6. Matikan mode maintenance

Situs saat ini **terkunci maintenance** (semua halaman 503) sejak 13 Juli 2026,
diatur di `src/lib/maintenance.ts` + `src/middleware.ts`.

Cara mengontrol lewat env:

```
MAINTENANCE_MODE=off        # matikan total (situs normal)
MAINTENANCE_MODE=on         # kunci paksa
MAINTENANCE_MODE=auto       # default: aktif bila now >= MAINTENANCE_START
MAINTENANCE_BYPASS_TOKEN=<rahasia>   # admin bisa akses: buka
                                     # https://maahir..../?maintenance_bypass=<rahasia>
```

Setelah migrasi selesai & terverifikasi → set `MAINTENANCE_MODE=off`, deploy.

---

## 7. Deploy

Deploy otomatis via Azure DevOps: push ke branch `main` → pipeline SSH ke
`103.181.142.223`, `git reset --hard`, `npm install`, `npm run build`, restart
`systemctl restart next-maahir`. Jadi cukup merge perubahan env/kode ke `main`.

---

## 8. Checklist migrasi

- [ ] PostgreSQL 17 terpasang; database dibuat
- [ ] Restore: `psql -f maahir_full_dump.sql` (atau `00_roles.sql` + `schema.sql` + `npm run load-data`)
- [ ] Jumlah baris cocok (peserta 84, setoran 186, audit_log 4432, dst.)
- [ ] `STORAGE_DIR` disiapkan + folder `${STORAGE_DIR}/setoran-audio/` bisa ditulis
      (audio lama TIDAK dimigrasikan — hanya untuk setoran baru)
- [ ] Env: `DATABASE_URL` + `STORAGE_DIR` + `SESSION_SECRET` di-set (var Supabase lama dibuang)
- [ ] Test login 1 akun tiap role + buka 1 setoran (cek data & audio)
- [ ] `MAINTENANCE_MODE=off` → deploy → situs normal

## 8b. Catatan shim pg — batasan yang perlu diperhatikan

Hasil audit migrasi (Supabase→pg). Tidak ada bug aktif; berikut hal LATEN yang
perlu diingat saat mengembangkan lagi:

- **Tipe kolom diselaraskan di `src/lib/pg-core.ts`** (type parser): `date`→string
  `"YYYY-MM-DD"`, `timestamptz`→ISO `…Z`, `numeric`/`int8`→number. Ini yang bikin
  kode lama (mengandalkan JSON supabase-js) tetap jalan. **Kalau menambah kolom
  bertipe baru**, pastikan tipenya cocok dengan asumsi kode.
- **Embedded join (`alias:fk(cols)`)** di-serialize oleh `to_jsonb` Postgres,
  BUKAN lewat type parser. Saat ini tak ada embed yang memilih kolom
  `timestamptz`. Kalau nanti ada, format waktunya beda (`+00:00` vs `Z`) — jangan
  string-slice/compare langsung; parse dgn `new Date()`.
- **`.or()` menyisipkan nilai mentah** (mis. `.or(\`ketua_wa.eq.${wa},...\`)`) —
  aman utk nomor WA/UUID, tapi nilai yg mengandung `.`/`,`/`)` bakal misparse.
  Jangan taruh input bebas ke `.or()`.
- **Storage filesystem** (`pg-storage.ts`) selalu overwrite (`upsert:true`
  di semua pemanggil) & set Content-Type dari ekstensi. Kalau butuh cegah
  overwrite (`upsert:false`), impl perlu ditambah.
- **Tak ada cap 1000 baris** (PostgREST dulu memotong diam-diam). Shim kembalikan
  semua baris; select besar tanpa `.range()` akan memuat semuanya.

## 9. Uji lokal (opsional, tanpa Postgres sistem)

- `npm run test-restore` — restore schema+data di PGlite, cek baris + FK.
- `npm run test-shim` — 18 pola query aplikasi (embed, or/not, count, upsert) di PGlite.
- Uji runtime penuh (app → pg.Pool → wire): jalankan `npx tsx scripts/pg-serve-test.ts`
  (server Postgres-wire dari PGlite di :54329), lalu `next start` dgn
  `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres PG_POOL_MAX=1`.
  (PGlite-socket satu koneksi → set `PG_POOL_MAX=1`; Postgres asli pakai default.)
