import 'server-only';
import { supabaseAdmin } from './supabase-admin';

/**
 * Pencarian baris peran berdasarkan nomor WhatsApp.
 *
 * Dulu pemanggilnya memakai `.maybeSingle()` langsung. Itu berbahaya: shim
 * mengembalikan `data: null` + error bila barisnya lebih dari satu
 * (`src/lib/pg-shim.ts`, "Expected 0-1 rows"), dan pemanggil hanya mengambil
 * `{ data }` — errornya hilang. Akibatnya satu baris kembar membuat perannya
 * lenyap dari sesi tanpa jejak: user tetap bisa login lewat peran lain, tapi
 * menu peran yang kembar itu tak pernah muncul dan tak ada yang tahu kenapa.
 * Persis itu yang terjadi pada satu pengajar (dua baris `pengajar`, WA sama,
 * salah satunya `active=false`) sampai dilaporkan manual.
 *
 * Sejak migration 0061 tabel-tabel ini punya indeks unik pada
 * `whatsapp_number`, jadi kembar tak bisa lahir lagi. Fungsi ini tetap
 * defensif untuk data lama atau baris yang ditulis di luar aplikasi: pilih
 * satu baris secara deterministik dan **teriak di log**, jangan diam-diam
 * mengunci orangnya.
 *
 * `ketua_kelas` sengaja TIDAK memakai fungsi ini — di sana satu WA boleh
 * punya banyak baris (satu orang bisa jadi ketua di beberapa halaqah), dan
 * pemanggilnya sudah menyaring `active=true` + `limit(1)` sendiri.
 */
export async function findRoleRowByWa<T extends { active?: boolean | null }>(
  table: 'peserta' | 'musyrif' | 'koordinator' | 'syaikh' | 'pengajar' | 'koordinator_ketua_kelas',
  columns: string,
  wa: string
): Promise<T | null> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(columns)
    .eq('whatsapp_number', wa)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`[role-lookup] gagal membaca ${table} untuk WA ${wa}: ${error.message}`);
    return null;
  }

  const rows = (data ?? []) as unknown as T[];
  if (rows.length <= 1) return rows[0] ?? null;

  // Baris aktif menang; kalau semuanya nonaktif ambil yang tertua supaya
  // pilihannya stabil antar-request (login dan loadAccessesForWa harus sepakat).
  console.error(
    `[role-lookup] DATA GANDA: ${rows.length} baris di "${table}" untuk WA ${wa}. ` +
      `Memakai baris aktif tertua; sisanya diabaikan. Duplikat ini perlu di-merge.`
  );
  return rows.find((r) => r.active) ?? rows[0];
}
