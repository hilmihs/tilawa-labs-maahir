import QRCode from 'qrcode';

// Generate QR sebagai data-URI SVG (server-side). Self-contained — aman untuk
// cetak/PDF & CSP karena tak memuat resource eksternal.
export async function qrSvgDataUri(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
  });
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
