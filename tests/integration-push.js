// Thông báo đẩy: lấy khóa, đăng ký thiết bị, gửi thử, nhắc hằng ngày (cron) – với "máy chủ thông báo" GIẢ LẬP tự giải mã nội dung nhận được.
import assert from 'node:assert/strict'; import http from 'node:http'; import crypto from 'node:crypto';
process.env.APP_PASSWORD = 'mat-khau-test'; process.env.SESSION_SECRET = 'x'.repeat(40); process.env.E2E_FAKE_BLOB = '1'; process.env.DB_DRIVER = 'blob'; delete process.env.GITHUB_TOKEN; delete process.env.CRON_SECRET;
// Thiết bị giả: có khóa p256dh/auth thật để giải mã như trình duyệt
const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const authSecret = crypto.randomBytes(16);
const H = (k, m) => crypto.createHmac('sha256', k).update(m).digest();
function decrypt(body) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ikm = H(H(authSecret, ua.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = H(salt, ikm); const cek = H(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16); const nonce = H(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16)); const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(pt[pt.length - 1], 2); return JSON.parse(pt.subarray(0, -1).toString());
}
const got = []; let pushStatus = 201; const realFetch = fetch;
globalThis.fetch = async (u, o = {}) => {
  if (!String(u).startsWith('https://push.example/')) return realFetch(u, o);
  assert.match(o.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/); assert.equal(o.headers['Content-Encoding'], 'aes128gcm');
  got.push({ url: String(u), data: decrypt(Buffer.from(o.body)) }); return new Response('', { status: String(u).includes('/dead') ? 410 : pushStatus });
};
const { entry } = await import('../lib/router.js');
const server = http.createServer(entry); await new Promise((r) => server.listen(0, r)); const base = `http://127.0.0.1:${server.address().port}`;
let cookie = '', csrf = '';
const call = async (m, p, body, auth = true, headers = {}) => { const res = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(auth && cookie ? { cookie } : {}), ...(auth && csrf ? { 'x-csrf-token': csrf } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: res.status, body: await res.json().catch(() => null) }; };
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ✓', n); } catch (e) { console.log('  ✗', n, '\n   ', e.message); process.exitCode = 1; } };
const sub = (path) => ({ endpoint: `https://push.example/${path}`, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: authSecret.toString('base64url') } });

await t('đăng nhập; lấy khóa công khai (tự tạo lần đầu); khóa bí mật KHÔNG gửi ra trình duyệt', async () => {
  csrf = (await call('POST', '/api/auth/login', { password: 'mat-khau-test' }, false)).body.csrf;
  const k = await call('GET', '/api/push/key'); assert.equal(k.status, 200); assert.equal(Buffer.from(k.body.publicKey, 'base64url').length, 65);
  const d = await call('GET', '/api/data'); assert.equal(d.body.db.meta.push, undefined); assert.ok(!JSON.stringify(d.body).includes('privateJwk'));
});
await t('đăng ký 2 thiết bị; gửi thử: nội dung giải mã được, thiết bị hỏng (410) tự bị xóa', async () => {
  assert.equal((await call('POST', '/api/push/subscribe', { subscription: sub('dien-thoai'), device: 'iPhone' })).status, 200);
  await call('POST', '/api/push/subscribe', { subscription: sub('dead'), device: 'Máy cũ' });
  assert.equal((await call('GET', '/api/data')).body.push.devices.length, 2);
  const r = await call('POST', '/api/push/test', {}); assert.equal(r.body.result.sent, 1); assert.equal(r.body.result.gone.length, 1);
  assert.match(got[0].data.title, /^\[Thử\] Phòng Trọ 70/); assert.equal(r.body.devices.length, 1);
});
await t('đăng ký sai định dạng bị từ chối', async () => assert.equal((await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://x' } })).status, 400));
await t('nhắc hằng ngày (cron): không có việc thì không gửi; có việc thì gửi số = số chuông; 20 giờ chỉ gửi 1 lần', async () => {
  got.length = 0;
  let r = await call('GET', '/api/cron/push', undefined, false); assert.match(r.body.skipped, /Không có việc/);
  await call('POST', '/api/debts', { name: 'Anh Ba', amount: 100000, date: '2026-11-01', kind: 'receivable' });
  const pub = await call('GET', '/api/public/reminders', undefined, false);
  r = await call('GET', '/api/cron/push', undefined, false); assert.equal(r.body.sent, 1); assert.equal(got[0].data.count, pub.body.badgeCount); assert.match(got[0].data.body, /Nhắc nợ riêng/);
  r = await call('GET', '/api/cron/push', undefined, false); assert.match(r.body.skipped, /20 giờ/);
});
await t('có CRON_SECRET: sai mã bị từ chối, đúng mã thì gửi (không bị giới hạn 20 giờ)', async () => {
  process.env.CRON_SECRET = 'bi-mat-cron';
  assert.equal((await call('GET', '/api/cron/push', undefined, false)).status, 401);
  const r = await call('GET', '/api/cron/push', undefined, false, { authorization: 'Bearer bi-mat-cron' }); assert.equal(r.body.sent, 1);
  delete process.env.CRON_SECRET;
});
await t('tắt thông báo: xóa thiết bị', async () => { await call('POST', '/api/push/unsubscribe', { endpoint: sub('dien-thoai').endpoint }); assert.equal((await call('GET', '/api/data')).body.push.devices.length, 0); });
await t('khôi phục file JSON giữ nguyên cài đặt thông báo hiện tại', async () => {
  await call('POST', '/api/push/subscribe', { subscription: sub('dien-thoai'), device: 'iPhone' });
  const exp = await (await fetch(base + '/api/backup/export', { headers: { cookie } })).json(); delete exp.meta.push;
  await call('POST', '/api/backup/restore', { db: exp, confirm: 'GHI DE' });
  assert.equal((await call('GET', '/api/data')).body.push.devices.length, 1);
});
server.close(); console.log(`\nThông báo đẩy: ${pass} đạt`);
