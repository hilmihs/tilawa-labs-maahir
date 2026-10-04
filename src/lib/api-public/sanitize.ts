// sanitize.ts — buang kunci terlarang rekursif (snake & camel), Map→objek.
// catatan/keterangan SENGAJA tidak masuk daftar — lihat spec §1, §5.
const FORBIDDEN_KEYS = new Set([
  'whatsapp_number', 'whatsappNumber',
  'ketua_wa', 'ketuaWa', 'wakil_wa', 'wakilWa',
  'password_hash', 'passwordHash',
  'magic_token', 'magicToken',
  'new_password_plaintext', 'newPasswordPlaintext',
  'token',
  'audio_url', 'audioUrl',
  'masukan',
  'ket_bacaan', 'ketBacaan', 'ket_hafalan', 'ketHafalan',
  'catatan_umum', 'catatanUmum',
  // Nomor WA pelapor Shakwa — dipakai koordinator untuk membalas, bukan konsumsi API.
  'pelapor_wa', 'pelaporWa',
]);

export function sanitize(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value) obj[String(k)] = sanitize(v);
    return obj;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}
