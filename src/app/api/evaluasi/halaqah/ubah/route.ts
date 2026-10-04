import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { tandaiKurasi } from '@/lib/evaluasi-kurasi';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const MIN_NAMA = 3;
const MAX_NAMA = 120;
const MAX_LEVEL = 60;

/**
 * Betulkan nama dan/atau level halaqah dari sisi pengajar.
 *
 * Keduanya kolom mirror hilmihs, jadi tiap kolom yang benar-benar berubah
 * ditandai terkurasi (migrasi 0074) supaya sync tak menariknya balik — lihat
 * src/lib/evaluasi-kurasi.ts. Data di hulu TIDAK ikut berubah: yang dirapikan
 * di sini hanya tampilan modul Evaluasi (judul layar, kop rapot).
 *
 * `level` boleh dikosongkan (null) — beberapa program memang tak memakainya dan
 * tampilan jatuh ke "Mustawa <n>".
 */
export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const accesses = s.accesses ?? (s.session ? [s.session] : []);
    const pengajar = accesses.find((a) => a.role === 'pengajar') as
      | { role: 'pengajar'; pengajar_id: string }
      | undefined;
    if (!pengajar) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      halaqah_id?: unknown;
      nama?: unknown;
      level?: unknown;
    };
    const halaqahId = body.halaqah_id;
    if (typeof halaqahId !== 'string' || !halaqahId) {
      return NextResponse.json({ error: 'halaqah_id wajib diisi' }, { status: 400 });
    }

    // Field yang tak dikirim = tak disentuh. Bedakan dari yang dikirim kosong:
    // level kosong itu sah (dihapus), nama kosong tidak.
    const ubahNama = body.nama !== undefined;
    const ubahLevel = body.level !== undefined;
    if (!ubahNama && !ubahLevel) {
      return NextResponse.json({ error: 'Tak ada yang diubah' }, { status: 400 });
    }

    let nama: string | null = null;
    if (ubahNama) {
      if (typeof body.nama !== 'string') {
        return NextResponse.json({ error: 'Nama halaqah wajib diisi.' }, { status: 400 });
      }
      nama = body.nama.trim().replace(/\s+/g, ' ');
      if (nama.length < MIN_NAMA) {
        return NextResponse.json({ error: 'Nama halaqah terlalu pendek.' }, { status: 400 });
      }
      if (nama.length > MAX_NAMA) {
        return NextResponse.json(
          { error: `Nama halaqah maksimal ${MAX_NAMA} huruf.` },
          { status: 400 }
        );
      }
    }

    let level: string | null = null;
    if (ubahLevel) {
      if (body.level !== null && typeof body.level !== 'string') {
        return NextResponse.json({ error: 'Level tidak valid.' }, { status: 400 });
      }
      const raw = typeof body.level === 'string' ? body.level.trim().replace(/\s+/g, ' ') : '';
      if (raw.length > MAX_LEVEL) {
        return NextResponse.json({ error: `Level maksimal ${MAX_LEVEL} huruf.` }, { status: 400 });
      }
      level = raw === '' ? null : raw;
    }

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, nama, level, pengajar_id')
      .eq('id', halaqahId)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    // Hanya kolom yang nilainya benar-benar berbeda yang ditandai terkurasi.
    // Menandai kolom yang isinya sama dengan hulu akan membekukannya tanpa
    // alasan: perubahan sah dari pusat jadi ikut terblokir selamanya.
    const patch: Record<string, unknown> = {};
    const kolomKurasi: string[] = [];
    if (ubahNama && nama !== null && nama !== halaqah.nama) {
      patch.nama = nama;
      kolomKurasi.push('nama');
    }
    if (ubahLevel && level !== (halaqah.level ?? null)) {
      patch.level = level;
      kolomKurasi.push('level');
    }
    if (kolomKurasi.length === 0) {
      return NextResponse.json({ ok: true, tidak_berubah: true });
    }

    const { error } = await supabaseAdmin
      .from('eval_halaqah')
      .update(patch)
      .eq('id', halaqahId);
    if (error) {
      console.error('[halaqah/ubah] gagal:', error.message);
      return NextResponse.json({ error: 'Gagal menyimpan data halaqah' }, { status: 500 });
    }
    await tandaiKurasi('eval_halaqah', halaqahId, kolomKurasi);

    void logAudit({
      actor: pengajar as never,
      action: 'evaluasi.halaqah.ubah',
      targetTable: 'eval_halaqah',
      targetId: halaqahId,
      detail: {
        kolom: kolomKurasi,
        sebelum: { nama: halaqah.nama, level: halaqah.level ?? null },
        sesudah: patch,
      },
    });

    return NextResponse.json({ ok: true, nama: patch.nama ?? halaqah.nama, level: 'level' in patch ? patch.level : (halaqah.level ?? null) });
  } catch (e: unknown) {
    console.error('[halaqah/ubah] error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Gagal menyimpan data halaqah' }, { status: 500 });
  }
}
