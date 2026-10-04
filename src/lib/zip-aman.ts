/**
 * Pemeriksaan arsip zip (xlsx) SEBELUM diurai.
 *
 * Batas ukuran unggahan hanya membatasi ukuran terkompresi. Berkas 5 MB yang
 * dirancang khusus bisa mengembang menjadi gigabita saat dibuka ExcelJS dan
 * menjatuhkan seluruh proses produksi. Direktori pusat zip mencatat ukuran asli
 * tiap entri, jadi totalnya bisa dibaca tanpa mengekstrak apa pun.
 */

export interface HasilCekZip {
  ok: boolean;
  alasan?: string;
  entri?: number;
  totalAsli?: number;
}

export function cekZipAman(
  data: ArrayBuffer,
  batas: { entriMaks?: number; asliMaksByte?: number } = {}
): HasilCekZip {
  const entriMaks = batas.entriMaks ?? 2000;
  const asliMaks = batas.asliMaksByte ?? 60 * 1024 * 1024;
  const v = new DataView(data);
  const n = data.byteLength;

  if (n < 22 || v.getUint32(0, true) !== 0x04034b50) {
    return { ok: false, alasan: 'Berkas bukan xlsx yang sah.' };
  }

  // End of central directory: dicari mundur, komentar zip maksimal 65535 byte.
  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, alasan: 'Berkas xlsx rusak.' };

  const jumlah = v.getUint16(eocd + 10, true);
  const ofsetPusat = v.getUint32(eocd + 16, true);
  // Zip64 (nilai penanda 0xFFFF/0xFFFFFFFF) tidak dipakai xlsx wajar; tolak saja.
  if (jumlah === 0xffff || ofsetPusat === 0xffffffff) {
    return { ok: false, alasan: 'Format xlsx tidak didukung.' };
  }
  if (jumlah > entriMaks) return { ok: false, alasan: 'Isi berkas xlsx terlalu banyak.' };

  let p = ofsetPusat;
  let total = 0;
  for (let e = 0; e < jumlah; e++) {
    if (p + 46 > n || v.getUint32(p, true) !== 0x02014b50) {
      return { ok: false, alasan: 'Berkas xlsx rusak.' };
    }
    const asli = v.getUint32(p + 24, true);
    if (asli === 0xffffffff) return { ok: false, alasan: 'Format xlsx tidak didukung.' };
    total += asli;
    if (total > asliMaks) return { ok: false, alasan: 'Isi berkas xlsx terlalu besar setelah dibuka.' };
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return { ok: true, entri: jumlah, totalAsli: total };
}
