// Số thông báo trên icon ứng dụng ở màn hình chính (App Badging API).
// - Android / máy tính (Chrome, Edge): hiện ngay khi đã cài app ("Thêm vào màn hình chính").
// - iPhone / iPad (iOS 16.4 trở lên): chỉ hiện khi mở bằng icon ở màn hình chính VÀ đã cho phép thông báo (nút "Bật số trên icon").
// Số được cập nhật mỗi lần mở app / tải lại dữ liệu (web không tự chạy ngầm khi app đang đóng).
import { html } from './util.js';
import { icon } from './icons.js';

export const badgeSupported = () => typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
const standalone = () => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
const needsPermission = () => typeof Notification !== 'undefined' && Notification.permission !== 'granted';

let last = null;
export function setBadge(n) {
  if (!badgeSupported()) return;
  const v = Math.max(0, Number(n) || 0); if (v === last) return; last = v;
  try { (v ? navigator.setAppBadge(v) : navigator.clearAppBadge()).catch(() => { last = null; }); } catch { last = null; }
}

// Nút cho phép hiện số trên icon (chỉ hiện khi app mở từ màn hình chính và trình duyệt cần quyền thông báo)
export function badgeButton() {
  if (!badgeSupported() || !standalone() || !needsPermission() || Notification.permission === 'denied') return '';
  return html`<button class="btn sm" data-act="badge-allow">${icon('bell', '1.1em')} Bật số thông báo trên icon</button>`;
}
export async function allowBadge() {
  try { const p = await Notification.requestPermission(); last = null; return p === 'granted'; } catch { return false; }
}
