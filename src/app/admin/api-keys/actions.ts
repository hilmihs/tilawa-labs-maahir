'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, getAdminActor } from '@/lib/admin-guard';
import { logAudit } from '@/lib/audit';
import { generateKey } from '@/lib/api-public/auth';
import type { ScopeName } from '@/lib/api-public/types';

const VALID_SCOPES: ScopeName[] = ['maahir', 'hits', 'penilaian', 'evaluasi', 'shakwa'];

export async function createKey(input: {
  nama: string;
  scopes: ScopeName[];
  expiresAt: string | null;
  keterangan: string | null;
}): Promise<{ raw: string; tokenPrefix: string }> {
  const { wa } = await requireAdmin();
  const actor = await getAdminActor();

  const nama = input.nama.trim();
  if (!nama) throw new Error('Nama wajib.');
  const scopes = input.scopes.filter((s) => VALID_SCOPES.includes(s));
  if (!scopes.length) throw new Error('Pilih minimal satu scope.');

  const { raw, tokenHash, tokenPrefix } = generateKey();
  const { error } = await supabaseAdmin.from('api_client').insert({
    nama,
    token_hash: tokenHash,
    token_prefix: tokenPrefix,
    scopes,
    expires_at: input.expiresAt,
    keterangan: input.keterangan,
    created_by: wa,
  });
  if (error) throw new Error('Gagal membuat key (nama mungkin sudah dipakai).');

  if (actor) {
    // Jangan pernah menuliskan raw/hash ke audit — hanya prefix.
    await logAudit({
      actor,
      action: 'api_key_create',
      targetTable: 'api_client',
      targetId: null,
      detail: { nama, scopes, token_prefix: tokenPrefix },
    });
  }

  return { raw, tokenPrefix };
}

export async function revokeKey(id: string): Promise<void> {
  const { wa } = await requireAdmin();
  const actor = await getAdminActor();

  const { data } = await supabaseAdmin
    .from('api_client')
    .select('nama, token_prefix')
    .eq('id', id)
    .maybeSingle();

  await supabaseAdmin
    .from('api_client')
    .update({ active: false, revoked_at: new Date().toISOString(), revoked_by: wa })
    .eq('id', id);

  if (actor) {
    await logAudit({
      actor,
      action: 'api_key_revoke',
      targetTable: 'api_client',
      targetId: id,
      detail: {
        id,
        nama: (data as { nama?: string } | null)?.nama,
        token_prefix: (data as { token_prefix?: string } | null)?.token_prefix,
      },
    });
  }
}
