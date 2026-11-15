// Nhắc cập nhật số điện thoại "tạm" (ví dụ 0111111111, 222222…): có 6 chữ số giống nhau liên tiếp.
// Chủ nhà bấm "Số đúng" thì lưu lại đúng số đó vào phoneOk → không nhắc nữa (đổi sang số khác vẫn kiểm tra lại).
import { bad, notFound } from './errors.js';

export const suspiciousPhone = (v) => /(\d)\1{5}/.test(String(v || '').replace(/\D/g, ''));
const FIELDS = { phone: 'Số điện thoại', zalo: 'Số Zalo' };

function checkPerson(p, base, out) {
  for (const f of Object.keys(FIELDS)) {
    const v = p[f]; if (!v || !suspiciousPhone(v)) continue;
    if (f === 'zalo' && v === p.phone) continue; // Zalo trùng số điện thoại: chỉ nhắc một lần ở số điện thoại
    if (p.phoneOk?.[f] === v) continue;
    out.push({ ...base, personId: p.id, name: p.fullName || '(chưa có tên)', field: f, label: FIELDS[f], value: v });
  }
}
// Chỉ kiểm tra khách đang thuê và người ở cùng của họ
export function phoneChecks(db) {
  const out = [];
  for (const r of db.rentals) {
    if (r.status !== 'active') continue;
    const t = db.tenants.find((x) => x.id === r.tenantId); if (!t || t.purgedAt) continue;
    const room = db.rooms.find((x) => x.id === r.roomId); const base = { roomId: r.roomId, roomName: room?.name || '' };
    checkPerson(t, { ...base, kind: 'tenant', role: 'Khách thuê' }, out);
    for (const o of db.occupants.filter((x) => x.tenantId === t.id)) checkPerson(o, { ...base, kind: 'occupant', role: 'Người ở cùng' }, out);
  }
  return out.sort((a, b) => a.roomName.localeCompare(b.roomName, 'vi', { numeric: true }));
}
export function confirmPhone(db, { kind, id, field }) {
  if (!FIELDS[field]) throw bad('Loại số không hợp lệ');
  const list = kind === 'occupant' ? db.occupants : db.tenants;
  const p = list.find((x) => x.id === id); if (!p) throw notFound('Không tìm thấy người cần xác nhận số');
  if (!p[field]) throw bad('Chưa có số để xác nhận');
  p.phoneOk = { ...(p.phoneOk || {}), [field]: p[field] };
  return { name: p.fullName, field, value: p[field] };
}
