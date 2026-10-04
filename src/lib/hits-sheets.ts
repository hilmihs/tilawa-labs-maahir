// Fetch Google Sheets yang di-publish-to-web sebagai CSV (tanpa service account).
// URL CSV per tab: /spreadsheets/d/<ID>/export?format=csv&gid=<GID>
// Enumerasi tab: parse /spreadsheets/d/<ID>/pubhtml (best-effort). Sumber gid
// otoritatif tetap baris manual di hits_sheet_source.

export type SheetTab = { name: string; gid: string };

const BASE = 'https://docs.google.com/spreadsheets/d';

/** Ambil ID spreadsheet dari URL penuh atau kembalikan apa adanya bila sudah ID. */
export function extractSpreadsheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input.trim();
}

export function csvUrl(spreadsheetId: string, gid: string): string {
  return `${BASE}/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

/** Fetch CSV satu tab. Throw dengan pesan jelas bila gagal. */
export async function fetchCsv(spreadsheetId: string, gid: string): Promise<string> {
  const url = csvUrl(spreadsheetId, gid);
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  if (!res.ok) {
    throw new Error(
      `Gagal fetch sheet (HTTP ${res.status}). Pastikan spreadsheet di-"Publish to web" / link-viewable. gid=${gid}`
    );
  }
  const text = await res.text();
  // Sheet privat sering mengembalikan halaman login HTML, bukan CSV.
  if (text.startsWith('<!DOCTYPE html') || text.includes('<html')) {
    throw new Error(
      `Sheet mengembalikan HTML (kemungkinan belum publik). Aktifkan "Publish to web". gid=${gid}`
    );
  }
  return text;
}

/**
 * Enumerasi tab via halaman pubhtml. Best-effort: hanya jalan bila
 * "Publish entire document" aktif. Kembalikan [] bila gagal/tak ketemu.
 */
export async function enumerateTabs(spreadsheetId: string): Promise<SheetTab[]> {
  try {
    const url = `${BASE}/${spreadsheetId}/pubhtml`;
    const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) return [];
    const html = await res.text();
    return parsePubhtmlTabs(html);
  } catch {
    return [];
  }
}

/**
 * Tab yang belum terdaftar (gid belum ada di `existingGids`) — pure, buat
 * auto-discover tab presensi baru tiap sync & cegah duplikat saat re-enumerate.
 */
export function newTabsToRegister(tabs: SheetTab[], existingGids: Iterable<string>): SheetTab[] {
  const seen = new Set(existingGids);
  const out: SheetTab[] = [];
  for (const t of tabs) {
    if (seen.has(t.gid)) continue;
    seen.add(t.gid); // dedup juga bila pubhtml mengulang gid
    out.push(t);
  }
  return out;
}

/** Parse daftar {name, gid} dari menu sheet di pubhtml. */
export function parsePubhtmlTabs(html: string): SheetTab[] {
  const out: SheetTab[] = [];
  const seen = new Set<string>();
  // pubhtml menampilkan tab sebagai <li ...><a href="#gid=123">Nama</a> atau
  // sebagai item dengan id="sheet-button-123". Tangani dua pola.
  const reHref = /href="[^"]*[#?&]gid=(\d+)"[^>]*>([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = reHref.exec(html))) {
    const gid = m[1];
    const name = decodeHtml(m[2]).trim();
    if (name && !seen.has(gid)) {
      seen.add(gid);
      out.push({ name, gid });
    }
  }
  return out;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}
