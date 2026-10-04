/** Read pixel dimensions from JPEG or PNG bytes (no decoding). */
export function imageSize(buf: ArrayBuffer): { w: number; h: number } | null {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  if (u[0] === 0x89 && u[1] === 0x50) return { w: dv.getUint32(16), h: dv.getUint32(20) };           // PNG IHDR
  if (u[0] === 0xff && u[1] === 0xd8) {                                                              // JPEG: find a SOF marker
    let i = 2;
    while (i + 9 < u.length) {
      if (u[i] !== 0xff) { i++; continue; }
      const m = u[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
      i += 2 + dv.getUint16(i + 2);
    }
  }
  return null;
}
