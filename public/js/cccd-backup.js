// BACKUP CĂN CƯỚC: tải về một file .zip chứa ảnh CCCD (2 mặt) của khách và người ở cùng các phòng đang ở,
// chia thư mục theo phòng, kèm file danh-sach-cccd.json để sau này tải lên khôi phục ảnh tự động.
// Làm ngay trên trình duyệt (máy chủ Vercel giới hạn ~4,5 MB mỗi lần trả về nên không nén ở máy chủ được).
import { D, api, apiUrl, today } from './api.js';
import { download, toast } from './util.js';
import { makeZip, readZip } from './zip.js';

export const MANIFEST = 'danh-sach-cccd.json';
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'khong-ten';
const SIDE = { front: 'mat-truoc', back: 'mat-sau' };

// Danh sách ảnh cần backup của các phòng đang ở (roomIds = null: tất cả phòng)
export function cccdItems(roomIds = null) {
  const db = D(); const out = [];
  const rentals = db.rentals.filter((r) => r.status === 'active' && (!roomIds || roomIds.includes(r.roomId)));
  for (const r of rentals) {
    const room = db.rooms.find((x) => x.id === r.roomId); const t = db.tenants.find((x) => x.id === r.tenantId); if (!t || t.purgedAt) continue;
    const people = [{ p: t, kind: 'tenant', role: 'khach-thue' }, ...db.occupants.filter((o) => o.tenantId === t.id).map((o) => ({ p: o, kind: 'occupant', role: 'nguoi-o-cung' }))];
    const dir = `${slug(room?.name)}_${slug(t.fullName)}`;
    for (const { p, kind, role } of people) for (const side of ['front', 'back']) {
      const img = p.idImages?.[side]; if (!img) continue;
      out.push({ img, file: `${dir}/${role}_${slug(p.fullName)}_${SIDE[side]}.${img.contentType === 'image/png' ? 'png' : img.contentType === 'image/webp' ? 'webp' : 'jpg'}`, ownerId: p.id, kind, side, name: p.fullName, cccd: p.cccd || '', room: room?.name || '' });
    }
  }
  return out;
}

export async function backupCccd(roomIds = null, label = 'cac-phong-dang-o') {
  const items = cccdItems(roomIds);
  if (!items.length) { toast('Chưa có ảnh căn cước nào để backup', 'err'); return; }
  toast(`Đang tải ${items.length} ảnh căn cước…`);
  const files = []; const list = []; let fail = 0;
  for (let i = 0; i < items.length; i += 4) { // tải 4 ảnh một lượt cho nhanh mà không quá tải
    await Promise.all(items.slice(i, i + 4).map(async (it) => {
      try { const r = await fetch(apiUrl(`storage/${it.img.id}`), { credentials: 'same-origin' }); if (!r.ok) throw new Error(String(r.status)); files.push({ name: it.file, data: new Uint8Array(await r.arrayBuffer()) }); list.push({ file: it.file, ownerId: it.ownerId, kind: it.kind, side: it.side, name: it.name, cccd: it.cccd, room: it.room, contentType: it.img.contentType || 'image/jpeg' }); }
      catch { fail++; }
    }));
  }
  if (!files.length) { toast('Không tải được ảnh nào từ kho ảnh. Kiểm tra kết nối kho ảnh (Sao lưu → Kiểm tra tất cả kết nối).', 'err'); return; }
  files.push({ name: MANIFEST, data: JSON.stringify({ app: 'Phong Tro 70', createdAt: new Date().toISOString(), count: list.length, images: list }, null, 1) });
  files.push({ name: 'DOC-TRUOC.txt', data: 'Backup anh can cuoc (CCCD) - Phong Tro 70 Hoang Sam.\r\nMoi thu muc la mot phong. File danh-sach-cccd.json dung de tai len lai (Sao luu -> Khoi phuc anh can cuoc tu file backup).\r\nKhong sua ten file va khong xoa file danh-sach-cccd.json neu muon khoi phuc tu dong.\r\nGiu file nay o noi rieng tu: day la giay to tuy than cua khach.\r\n' });
  download(`backup-can-cuoc-${label}-${today()}.zip`, makeZip(files), 'application/zip');
  toast(fail ? `Đã tải ${list.length} ảnh, ${fail} ảnh không tải được (ảnh có thể đã mất trong kho)` : `Đã tải xong ${list.length} ảnh căn cước`, fail ? 'err' : undefined);
}

// Khôi phục ảnh từ file backup .zip: gắn ảnh vào đúng người (theo mã người, nếu không có thì theo số CCCD) rồi tải lên kho ảnh.
// overwrite = false: người đã có ảnh mặt đó thì giữ nguyên ảnh đang có.
export async function restoreCccd(file, overwrite = false, onProgress = () => {}) {
  const entries = await readZip(await file.arrayBuffer());
  const man = entries.find((e) => e.name.split('/').pop() === MANIFEST);
  if (!man) throw new Error(`Không thấy file ${MANIFEST} trong file zip. Hãy dùng đúng file do nút "Backup căn cước" tạo ra.`);
  let m; try { m = JSON.parse(new TextDecoder().decode(man.data)); } catch { throw new Error(`File ${MANIFEST} bị lỗi`); }
  const byName = new Map(entries.map((e) => [e.name, e])); const res = { done: 0, skipped: 0, notFound: [], failed: 0, total: (m.images || []).length };
  for (const it of m.images || []) {
    const db = D(); const all = [...db.tenants.map((p) => ({ p, kind: 'tenant' })), ...db.occupants.map((p) => ({ p, kind: 'occupant' }))].filter((x) => !x.p.purgedAt);
    let who = all.find((x) => x.p.id === it.ownerId);
    if (!who && it.cccd) { const same = all.filter((x) => x.p.cccd && x.p.cccd === it.cccd); if (same.length === 1) who = same[0]; }
    if (!who) { res.notFound.push(`${it.name} (${it.room})`); continue; }
    if (who.p.idImages?.[it.side] && !overwrite) { res.skipped++; continue; }
    const e = byName.get(it.file) || entries.find((x) => x.name.endsWith(it.file.split('/').pop())); if (!e) { res.failed++; continue; }
    try { await api('POST', `storage/upload?ownerId=${encodeURIComponent(who.p.id)}&side=${it.side}`, new Blob([e.data], { type: it.contentType || 'image/jpeg' }), { headers: { 'Content-Type': it.contentType || 'image/jpeg' } }); res.done++; }
    catch { res.failed++; }
    onProgress(res);
  }
  return res;
}
