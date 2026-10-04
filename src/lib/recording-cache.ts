import type { JenisRekaman } from '@/types/db';

const DB_NAME = 'maahir-recordings';
const STORE = 'cache';
const DB_VERSION = 1;

// Rekaman sebagian (draf yang disimpan berkala SELAMA merekam) memakai store
// yang sama dengan awalan kunci ini, supaya tidak pernah ikut terbaca oleh
// `loadRecordings` (yang membaca kunci persis `${weekStart}/${jenis}`) dan
// tidak ter-kirim otomatis sebagai rekaman final.
const PARTIAL_PREFIX = 'partial:';

interface CacheEntry {
  key: string;
  blob: Blob;
  durationSec: number;
  // ms epoch saat draf disimpan. Entri lama (sebelum kolom ini ada) tak punya.
  savedAt?: number;
}

export interface CachedRecording {
  blob: Blob;
  durationSec: number;
  savedAt?: number;
}

export interface PartialRecording {
  blob: Blob;
  durationSec: number;
  savedAt: number;
}

// Satu koneksi dipakai bersama. Selain hemat (draf sebagian disimpan tiap
// ~10 detik), koneksi tunggal menjamin urutan transaksi: hapus lalu simpan
// yang dipanggil berurutan juga dieksekusi berurutan.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Tab lain minta upgrade versi / koneksi ditutup browser → buka ulang nanti.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  dbPromise = p;
  p.catch(() => {
    if (dbPromise === p) dbPromise = null;
  });
  return p;
}

function putEntry(entry: CacheEntry): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(entry);
        // oncomplete = data benar-benar ter-commit (bukan sekadar request sukses).
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

function deleteKey(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

function getEntry(key: string): Promise<CacheEntry | undefined> {
  return openDb().then(
    (db) =>
      new Promise<CacheEntry | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as CacheEntry | undefined);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function saveRecording(
  weekStart: string,
  jenis: string,
  blob: Blob,
  durationSec: number
): Promise<void> {
  try {
    await putEntry({ key: `${weekStart}/${jenis}`, blob, durationSec, savedAt: Date.now() });
  } catch {
    // IndexedDB unavailable (private browsing, quota exceeded) — silent fail
  }
}

export async function deleteRecording(weekStart: string, jenis: string): Promise<void> {
  try {
    await deleteKey(`${weekStart}/${jenis}`);
  } catch {
    // silent fail
  }
}

/**
 * Draf rekaman per jenis untuk satu periode. `savedAt` (ms epoch) ikut
 * dikembalikan bila ada — dipakai AudioRecorder (`initialRecordingSavedAt`)
 * untuk memutuskan apakah draf lebih baru daripada rekaman di server.
 */
export async function loadRecordings(
  weekStart: string
): Promise<Partial<Record<JenisRekaman, CachedRecording>>> {
  try {
    const jenisRekaman: JenisRekaman[] = ['tuhfatul_athfal', 'jazariyyah', 'syawahid'];
    const results = await Promise.all(
      jenisRekaman.map((jenis) => getEntry(`${weekStart}/${jenis}`))
    );
    const out: Partial<Record<JenisRekaman, CachedRecording>> = {};
    jenisRekaman.forEach((jenis, i) => {
      const entry = results[i];
      if (entry) {
        out[jenis] = {
          blob: entry.blob,
          durationSec: entry.durationSec,
          ...(entry.savedAt != null ? { savedAt: entry.savedAt } : {}),
        };
      }
    });
    return out;
  } catch {
    return {};
  }
}

export async function clearRecordings(weekStart: string): Promise<void> {
  const jenisRekaman: JenisRekaman[] = ['tuhfatul_athfal', 'jazariyyah', 'syawahid'];
  await Promise.all(
    jenisRekaman.map((jenis) => deleteKey(`${weekStart}/${jenis}`).catch(() => {}))
  );
}

// --- Rekaman sebagian (selama merekam) ------------------------------------
// Disimpan berkala oleh AudioRecorder supaya rekaman tidak hilang total saat
// tab dimatikan sistem (HP terkunci lama, baterai habis, browser crash).
// Saat halaman dibuka lagi, peserta ditawari memakai atau membuangnya.

export async function savePartialRecording(
  key: string,
  blob: Blob,
  durationSec: number
): Promise<boolean> {
  try {
    await putEntry({ key: PARTIAL_PREFIX + key, blob, durationSec, savedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

export async function loadPartialRecording(key: string): Promise<PartialRecording | null> {
  try {
    const entry = await getEntry(PARTIAL_PREFIX + key);
    if (!entry || !entry.blob || entry.blob.size === 0) return null;
    return {
      blob: entry.blob,
      durationSec: entry.durationSec,
      savedAt: entry.savedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export async function deletePartialRecording(key: string): Promise<void> {
  try {
    await deleteKey(PARTIAL_PREFIX + key);
  } catch {
    // silent fail
  }
}
