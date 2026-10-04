-- Enable Row Level Security on all public tables.
-- All app queries use service_role (bypasses RLS).
-- This blocks unauthorized access via the public anon key.

-- Existing tables (migrations 0001-0003)
ALTER TABLE public.musyrif ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.koordinator ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peserta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setoran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rekaman ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syaikh ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setoran_musyrif ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rekaman_musyrif ENABLE ROW LEVEL SECURITY;

-- HITS Matrix tables (migration 0004)
ALTER TABLE public.kelompok_pengajar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengajar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.koordinator_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kelas_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ketua_kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.koordinator_ketua_kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_kehadiran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_pengajar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengajuan_alasan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.libur_program ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penilaian_masyaikh ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penilaian_pedagogis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observasi_kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabayyun ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teguran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jadwal_pindah ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matrix_rekap ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indikator_standar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
