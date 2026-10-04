-- 0023_drop_koordinator_hits.sql
-- Hapus role login koordinator_hits. Role ini vestigial: auth tidak pernah
-- membuat sesinya dan halaman-halamannya (kehadiran/koordinator, shakwa) sudah dihapus.
-- Koordinasi HITS sekarang sepenuhnya lewat koordinator_ketua_kelas.
--
-- CATATAN: string 'koordinator_hits' TETAP valid sebagai nilai
-- penilaian_masyaikh.assessor_role (lihat 0004) — itu nilai enum kolom untuk
-- domain penilaian masyaikh oleh koordinator setoran, BUKAN tabel role ini.
-- CHECK constraint penilaian_masyaikh sengaja tidak diubah.

-- cascade: ikut menghapus policy RLS (0005) dan FK yang menunjuk tabel ini
-- (mis. libur_program.created_by_id) tanpa menghapus kolomnya.
drop table if exists koordinator_hits cascade;
