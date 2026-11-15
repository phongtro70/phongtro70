// Tạo / đọc file .zip ngay trên trình duyệt (không cần thư viện ngoài).
// Ghi: kiểu "store" (ảnh JPG đã nén sẵn nên không cần nén thêm). Đọc: kiểu store và deflate (zip tạo bằng Windows/Mac).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const enc = new TextEncoder();
function dosTime(d = new Date()) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }

// files: [{ name: 'thu-muc/ten.jpg', data: Uint8Array | string }] → Blob .zip
export function makeZip(files) {
  const parts = [], central = []; let off = 0; const { time, date } = dosTime();
  for (const f of files) {
    const name = enc.encode(f.name); const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data; const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, name);
    off += 30 + name.length + data.length;
  }
  const csize = central.reduce((s, b) => s + (b.byteLength ?? b.length), 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}

async function inflateRaw(u8) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Trình duyệt này không giải nén được file zip đã nén. Hãy dùng đúng file zip do nút "Backup căn cước" tạo ra, hoặc mở bằng Chrome/Safari mới.');
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer());
}
// Đọc zip → [{ name, data: Uint8Array }]
export async function readZip(buf) {
  const u8 = new Uint8Array(buf); const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const dec = new TextDecoder();
  let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('File không phải file .zip hợp lệ');
  const n = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true); const out = [];
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('File .zip bị lỗi');
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), loc = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const start = loc + 30 + v.getUint16(loc + 26, true) + v.getUint16(loc + 28, true); const raw = u8.subarray(start, start + csize);
    out.push({ name, data: method === 0 ? raw.slice() : method === 8 ? await inflateRaw(raw) : null });
  }
  return out.filter((f) => f.data);
}
