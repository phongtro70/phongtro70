// Số thông báo trên icon app + thông báo đẩy về điện thoại.
// - Số trên icon (App Badging API): cập nhật mỗi lần mở app, và mỗi sáng khi máy chủ gửi thông báo nhắc.
// - Thông báo đẩy (Web Push): máy chủ gửi mỗi sáng khoảng 7–8 giờ, kể cả khi app đang đóng.
// iPhone / iPad (iOS 16.4+): chỉ chạy khi mở app bằng icon ở màn hình chính VÀ đã bấm "Bật thông báo" → Cho phép.
import { html } from './util.js';
import { icon } from './icons.js';
import { S, api } from './api.js';

export const badgeSupported = () => typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
const standalone = () => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const perm = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

let last = null;
export function setBadge(n) {
  if (!badgeSupported()) return;
  const v = Math.max(0, Number(n) || 0); if (v === last) return; last = v;
  try { (v ? navigator.setAppBadge(v) : navigator.clearAppBadge()).catch(() => { last = null; }); } catch { last = null; }
}

// Đăng ký service worker (chỉ để nhận thông báo đẩy)
let regP = null;
export function registerSW() { if (!pushSupported()) return null; if (!regP) regP = navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null); return regP; }

const b64ToU8 = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const deviceName = () => { const u = navigator.userAgent; const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || (isIOS() && !/iPhone/.test(u)) ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Máy tính Windows' : /Mac/.test(u) ? 'Máy Mac' : 'Thiết bị'; const br = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : ''; return `${os}${br && !standalone() ? ` (${br})` : standalone() ? ' (app màn hình chính)' : ''}`; };

// Gửi đăng ký của máy này lên máy chủ (cần đã đăng nhập). Trả về true nếu xong.
export async function subscribeThisDevice() {
  if (!pushSupported() || perm() !== 'granted' || !S.loggedIn) return false;
  const reg = await registerSW(); if (!reg) return false; await navigator.serviceWorker.ready;
  const { publicKey } = await api('GET', 'push/key');
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey) { const cur = new Uint8Array(sub.options.applicationServerKey); const want = b64ToU8(publicKey); if (cur.length !== want.length || cur.some((v, i) => v !== want[i])) { await sub.unsubscribe(); sub = null; } }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
  await api('POST', 'push/subscribe', { subscription: sub.toJSON(), device: deviceName() });
  try { localStorage.setItem('pt70_push', sub.endpoint); } catch { /* bỏ qua */ }
  return true;
}
export async function unsubscribeThisDevice() {
  const reg = await registerSW(); const sub = reg && (await reg.pushManager.getSubscription()); if (!sub) return false;
  try { await api('POST', 'push/unsubscribe', { endpoint: sub.endpoint }); } finally { await sub.unsubscribe(); try { localStorage.removeItem('pt70_push'); } catch { /* bỏ qua */ } }
  return true;
}
export async function thisDeviceOn() { try { const reg = await registerSW(); const sub = reg && (await reg.pushManager.getSubscription()); return !!sub && (S.snap?.push?.devices || []).some((d) => sub.endpoint.endsWith(d.endpointTail)); } catch { return false; } }

// Nút ở đầu trang: hiện khi máy này CÓ THỂ bật nhưng chưa cho phép thông báo
export function badgeButton() {
  const can = pushSupported() ? (!isIOS() || standalone()) : badgeSupported() && standalone();
  if (!can || perm() !== 'default') return '';
  return html`<button class="btn sm" data-act="badge-allow">${icon('bell', '1.1em')} Bật thông báo & số trên icon</button>`;
}
// Bấm nút: hỏi quyền → đăng ký nhận thông báo (nếu đã đăng nhập; chưa đăng nhập thì tự đăng ký sau khi đăng nhập)
export async function allowBadge() {
  try { const p = await Notification.requestPermission(); last = null; if (p !== 'granted') return false; registerSW(); if (S.loggedIn) await subscribeThisDevice(); return true; } catch { return false; }
}
export const pushPerm = perm;
export const pushNeedsHomeScreen = () => isIOS() && !standalone();
