// Service worker của Phòng Trọ 70: CHỈ dùng để nhận thông báo đẩy và đặt số trên icon app (không lưu trang để chạy offline).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Phòng Trọ 70', body: e.data ? e.data.text() : '' }; }
  const n = Number(d.count) || 0;
  const badge = 'setAppBadge' in self.navigator ? (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {}) : Promise.resolve();
  e.waitUntil(Promise.all([badge, self.registration.showNotification(d.title || 'Phòng Trọ 70', { body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: 'pt70-nhac', renotify: true, data: { url: d.url || '/' } })]));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close(); const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => { for (const c of list) { if ('focus' in c) return c.focus(); } return self.clients.openWindow(url); }));
});
