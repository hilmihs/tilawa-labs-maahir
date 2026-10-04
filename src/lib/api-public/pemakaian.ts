// Tanpa penanda 'server-only' seperti auth.ts: uji luring (npm run test-api)
// mengimpor modul ini lewat auth.ts tanpa runtime Next.
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Pemakaian API publik per endpoint.
 *
 * `api_client.request_count` hanya menjawab "key ini dipakai berapa kali",
 * bukan "endpoint mana". Di sini dihitung per (key, endpoint, hari), diakru di
 * memori lalu ditulis bersama flush pemakaian tiap 60 detik — satu permintaan
 * API tidak menunggu satu INSERT.
 *
 * Parameter kueri TIDAK dicatat: `pengajar_id`, `wa`, dan sejenisnya adalah data
 * orang, dan pertanyaan yang ingin dijawab tidak membutuhkannya.
 */

interface Akru {
  jumlah: number;
  gagal: number;
  terakhir: number;
}

const akru = new Map<string, Akru>();

/** Tanggal Asia/Jakarta — rekap harian mengikuti hari kerja tim, bukan UTC. */
function hariIni(sekarang = new Date()): string {
  return sekarang.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

export function catatEndpoint(clientId: string, endpoint: string, berhasil: boolean): void {
  const kunci = `${clientId}|${endpoint}|${hariIni()}`;
  const ada = akru.get(kunci) ?? { jumlah: 0, gagal: 0, terakhir: 0 };
  ada.jumlah += 1;
  if (!berhasil) ada.gagal += 1;
  ada.terakhir = Date.now();
  akru.set(kunci, ada);
}

export function __tiriskanEndpoint(): { clientId: string; endpoint: string; tanggal: string; nilai: Akru }[] {
  const out = [...akru.entries()].map(([kunci, nilai]) => {
    const [clientId, endpoint, tanggal] = kunci.split('|');
    return { clientId, endpoint, tanggal, nilai };
  });
  akru.clear();
  return out;
}

export async function flushEndpoint(): Promise<void> {
  for (const { clientId, endpoint, tanggal, nilai } of __tiriskanEndpoint()) {
    try {
      const { data } = await supabaseAdmin
        .from('api_pemakaian_endpoint')
        .select('jumlah, jumlah_gagal')
        .eq('client_id', clientId)
        .eq('endpoint', endpoint)
        .eq('tanggal', tanggal)
        .maybeSingle();
      const lama = data as { jumlah?: number; jumlah_gagal?: number } | null;
      const baris = {
        client_id: clientId,
        endpoint,
        tanggal,
        jumlah: Number(lama?.jumlah ?? 0) + nilai.jumlah,
        jumlah_gagal: Number(lama?.jumlah_gagal ?? 0) + nilai.gagal,
        terakhir: new Date(nilai.terakhir).toISOString(),
      };
      const { error } = lama
        ? await supabaseAdmin
            .from('api_pemakaian_endpoint')
            .update(baris)
            .eq('client_id', clientId)
            .eq('endpoint', endpoint)
            .eq('tanggal', tanggal)
        : await supabaseAdmin.from('api_pemakaian_endpoint').insert(baris);
      // Kegagalan mencatat tidak boleh menjatuhkan flush pemakaian lain.
      if (error) console.error('[api] gagal menulis pemakaian endpoint', endpoint, error.message);
    } catch (e) {
      console.error('[api] gagal menulis pemakaian endpoint', endpoint, (e as Error).message);
    }
  }
}
