// Thông báo đẩy về điện thoại (Web Push): đăng ký thiết bị, gửi thử, gửi nhắc hằng ngày (Vercel Cron, khoảng 7–8 giờ sáng).
// Khóa VAPID tự tạo ở lần bật đầu tiên và lưu trong dữ liệu (db.meta.push) – chủ nhà không phải khai báo biến môi trường nào.
import { bad } from './errors.js';
import { generateVapid, sendPush } from './webpush.js';
import { buildReminders, badgeCount } from './reminders.js';
import { usageOverview } from './usage.js';
import { debtStats } from './debts.js';
import { phoneChecks } from './phones.js';

const MAX_SUBS = 10;
export const pushOf = (db) => (db.meta = db.meta || {}, db.meta.push = db.meta.push || { vapid: null, subs: [], lastSent: '', lastResult: null }, db.meta.push);
export function ensureVapid(db) { const p = pushOf(db); if (!p.vapid) p.vapid = generateVapid(); return p.vapid.publicKey; }

export function addSub(db, sub, device, origin) {
  const ok = sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.keys?.p256dh && sub.keys?.auth;
  if (!ok) throw bad('Thông tin đăng ký thông báo không hợp lệ');
  const p = pushOf(db); ensureVapid(db);
  p.subs = p.subs.filter((s) => s.endpoint !== sub.endpoint);
  p.subs.push({ endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, device: String(device || 'Thiết bị').slice(0, 80), origin: String(origin || '').slice(0, 200), createdAt: new Date().toISOString() });
  if (p.subs.length > MAX_SUBS) p.subs = p.subs.slice(-MAX_SUBS);
  return p.subs.length;
}
export function removeSub(db, endpoint) { const p = pushOf(db); const n = p.subs.length; p.subs = p.subs.filter((s) => s.endpoint !== endpoint); return n - p.subs.length; }
export const pushStatus = (db) => { const p = db.meta?.push; return { devices: (p?.subs || []).map((s) => ({ endpointTail: s.endpoint.slice(-12), device: s.device, createdAt: s.createdAt })), lastSent: p?.lastSent || '', lastResult: p?.lastResult || null }; };

// Nội dung thông báo: số việc (bằng số ở chuông) + vài dòng tóm tắt, KHÔNG có họ tên / số điện thoại (hiện cả trên màn hình khóa)
export function digest(db, today) {
  const list = buildReminders(db, today); const count = badgeCount(db, today, list);
  const lines = list.slice(0, 4).map((r) => `${r.roomName}: ${r.label}${r.remaining > 0 && ['overdue', 'debt', 'unpaid', 'partial', 'ended_debt'].includes(r.type) ? ` (${r.remaining.toLocaleString('vi-VN')} đ)` : ''}`);
  if (list.length > 4) lines.push(`… và ${list.length - 4} thông báo phòng khác`);
  const al = usageOverview(db, today).alerts.length; if (al) lines.push(`Cảnh báo điện nước: ${al}`);
  const dr = debtStats(db, 'receivable').openCount, dp = debtStats(db, 'payable').openCount; if (dr || dp) lines.push(`Nhắc nợ riêng: ${[dr ? `${dr} khoản cần thu` : '', dp ? `${dp} khoản cần trả` : ''].filter(Boolean).join(', ')}`);
  const ph = phoneChecks(db).length; if (ph) lines.push(`Số điện thoại cần cập nhật: ${ph}`);
  return { count, title: count ? `Phòng Trọ 70: ${count} việc cần xử lý` : 'Phòng Trọ 70: không có việc cần xử lý', body: lines.join('\n') || 'Mọi phòng đều ổn.' };
}

// Gửi tới mọi thiết bị đã bật. Trả về kết quả + danh sách thiết bị hỏng để xóa.
export async function sendAll(db, data, opts = {}) {
  const p = db.meta?.push; if (!p?.vapid || !p.subs?.length) return { sent: 0, failed: 0, gone: [], total: 0 };
  const out = { sent: 0, failed: 0, gone: [], total: p.subs.length, errors: [] };
  await Promise.all(p.subs.map(async (s) => {
    try { const r = await sendPush(s, data, p.vapid, s.origin ? s.origin : 'mailto:chu-nha@example.com', opts); if (r.ok) out.sent++; else { out.failed++; out.errors.push(r.status); if (r.gone) out.gone.push(s.endpoint); } }
    catch (e) { out.failed++; out.errors.push(String(e.message || e).slice(0, 80)); }
  }));
  return out;
}
