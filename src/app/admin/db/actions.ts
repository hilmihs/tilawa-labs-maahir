'use server';

import { requireAdmin, getAdminActor } from '@/lib/admin-guard';
import { runAdminSql, type AdminSqlResult } from '@/lib/admin-db';
import {
  browseTable,
  insertRow,
  updateRow,
  deleteRow,
  type BrowseResult,
  type MutateResult,
} from '@/lib/admin-crud';
import { getSchemaTree, type SchemaGroup } from '@/lib/admin-schema';

export type ConsoleResult = ({ ok: true } & AdminSqlResult) | { ok: false; error: string };
export type BrowseActionResult = ({ ok: true } & BrowseResult) | { ok: false; error: string };
export type MutateActionResult = ({ ok: true } & MutateResult) | { ok: false; error: string };
export type SchemaActionResult = { ok: true; groups: SchemaGroup[] } | { ok: false; error: string };

/**
 * Server actions untuk /admin/db. requireAdmin() di TIAP action (jangan andalkan
 * middleware). Audit teratribusi ke superadmin via getAdminActor().
 */

export async function runConsoleSql(sql: string, confirm: boolean, allowNonTx = false): Promise<ConsoleResult> {
  await requireAdmin();
  const actor = await getAdminActor();
  try {
    const result = await runAdminSql(sql, { confirm, allowNonTx, source: 'console', actor });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getSchemaAction(): Promise<SchemaActionResult> {
  await requireAdmin();
  try {
    const groups = await getSchemaTree();
    return { ok: true, groups };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function browseTableAction(
  table: string,
  opts: { search?: string; page?: number; pageSize?: number }
): Promise<BrowseActionResult> {
  await requireAdmin();
  try {
    const result = await browseTable(table, opts);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function insertRowAction(
  table: string,
  values: Record<string, any>,
  confirm: boolean
): Promise<MutateActionResult> {
  await requireAdmin();
  const actor = await getAdminActor();
  try {
    const result = await insertRow(table, values, { confirm, actor });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateRowAction(
  table: string,
  pk: Record<string, any>,
  changes: Record<string, any>,
  confirm: boolean
): Promise<MutateActionResult> {
  await requireAdmin();
  const actor = await getAdminActor();
  try {
    const result = await updateRow(table, pk, changes, { confirm, actor });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteRowAction(
  table: string,
  pk: Record<string, any>,
  confirm: boolean
): Promise<MutateActionResult> {
  await requireAdmin();
  const actor = await getAdminActor();
  try {
    const result = await deleteRow(table, pk, { confirm, actor });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
