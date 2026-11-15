// Vercel Blob (kho RIÊNG TƯ): dùng cho ảnh CCCD và (mặc định) cho cả file dữ liệu database.json.
// Kết nối: Vercel hiện mặc định dùng OIDC (biến BLOB_STORE_ID + VERCEL_OIDC_TOKEN tự xoay vòng) - thư viện @vercel/blob tự dùng.
// Kiểu cũ BLOB_READ_WRITE_TOKEN vẫn được hỗ trợ (bắt buộc khi chạy ngoài Vercel, ví dụ Render).
import { ApiError } from './errors.js';

// ---- Bản giả lập trong bộ nhớ, CHỈ để kiểm thử (E2E_FAKE_BLOB=1). Mô phỏng ETag + ifMatch + allowOverwrite. ----
export const fakeStore = { files: new Map(), n: 0, beforePut: null, failPuts: 0 };
const fake = {
  put: async (p, body, o = {}) => {
    if (fakeStore.failPuts > 0) { fakeStore.failPuts--; throw new Error('Service unavailable'); }
    if (fakeStore.beforePut) { const f = fakeStore.beforePut; fakeStore.beforePut = null; f(); }
    const cur = fakeStore.files.get(p);
    if (cur && !o.allowOverwrite) throw new Error('This blob already exists');
    if (cur && o.ifMatch && o.ifMatch !== cur.etag) { const e = new Error('Precondition failed'); e.name = 'BlobPreconditionFailedError'; throw e; }
    const pathname = !cur && o.addRandomSuffix ? p.replace(/(\.\w+)?$/, `-${++fakeStore.n}$1`) : p;
    fakeStore.files.set(pathname, { buf: Buffer.from(body), etag: `"e${++fakeStore.n}"`, at: new Date().toISOString() });
    return { pathname };
  },
  get: async (p) => { const f = fakeStore.files.get(p); return f ? { statusCode: 200, stream: new Blob([f.buf]).stream(), blob: { etag: f.etag, contentType: 'application/octet-stream' } } : null; },
  list: async ({ prefix = '' } = {}) => ({ blobs: [...fakeStore.files.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ pathname: k, uploadedAt: v.at })) }),
  del: async (p) => { fakeStore.files.delete(p); },
};
const onVercel = () => !!(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN);
export const blobAuth = () => (process.env.E2E_FAKE_BLOB ? 'fake' : process.env.BLOB_READ_WRITE_TOKEN ? 'token' : process.env.BLOB_STORE_ID && onVercel() ? 'oidc' : null);
export const hasBlobConfig = () => !!blobAuth();
export const sdk = async () => {
  if (process.env.E2E_FAKE_BLOB) return fake;
  if (!hasBlobConfig()) throw Object.assign(new Error('Chưa tạo/kết nối kho Vercel Blob. Làm theo hướng dẫn bước "Tạo kho lưu trữ (Blob)" rồi Redeploy.'), { status: 500, code: 'CONFIG' });
  return import('@vercel/blob');
};
export const blobFail = (e) => {
  if (e instanceof ApiError || e?.code === 'CONFIG') throw e;
  throw new ApiError(502, `Kho Vercel Blob báo lỗi (có thể hết dung lượng/hạn mức hoặc token kho sai): ${String(e?.message || e).slice(0, 160)}`, 'BLOB');
};
const wrap = async (fn) => { try { return await fn(); } catch (e) { return blobFail(e); } };
export const putPrivate = (pathname, buf, contentType) => wrap(async () => (await sdk()).put(pathname, buf, { access: 'private', contentType, addRandomSuffix: true }));
export const getPrivate = (pathname) => wrap(async () => (await sdk()).get(pathname, { access: 'private' }));
export const delPrivate = (pathname) => wrap(async () => (await sdk()).del(pathname));
// Liệt kê toàn bộ file trong kho theo tiền tố (tự lật trang)
export const listPrivate = (prefix) => wrap(async () => {
  const b = await sdk(); const out = []; let cursor;
  do { const r = await b.list({ prefix, cursor, limit: 1000 }); out.push(...(r.blobs || [])); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return out;
});
// Ảnh CCCD lưu ở cccd/<mã người>/<front|back>-<ngẫu nhiên>.jpg → bảng tra ảnh MỚI NHẤT của từng người, từng mặt
export async function cccdIndex() {
  const map = new Map();
  for (const x of await listPrivate('cccd/')) {
    const m = /^cccd\/([^/]+)\/(front|back)[-.]/.exec(x.pathname); if (!m) continue;
    const k = `${m[1]}|${m[2]}`; const at = String(x.uploadedAt instanceof Date ? x.uploadedAt.toISOString() : x.uploadedAt || '');
    const cur = map.get(k); if (!cur || at > cur.uploadedAt) map.set(k, { pathname: x.pathname, size: x.size || 0, uploadedAt: at });
  }
  return map;
}
