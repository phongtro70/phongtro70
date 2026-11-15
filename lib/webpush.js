// Gửi thông báo đẩy (Web Push) tới iPhone / Android / máy tính – chỉ dùng thư viện có sẵn của Node, không cần cài thêm.
// Chuẩn: VAPID (RFC 8292) để máy chủ tự xưng danh; mã hóa nội dung aes128gcm (RFC 8291 + RFC 8188).
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s), 'base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Tạo cặp khóa VAPID (một lần, lưu lại dùng mãi)
export function generateVapid() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]);
  return { publicKey: b64u(pub), privateJwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d } };
}

// Chữ ký VAPID: JWT ES256 gửi kèm mỗi lần đẩy
export function vapidHeader(endpoint, vapid, subject, now = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: now + 12 * 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: vapid.privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${vapid.publicKey}`;
}

// Mã hóa nội dung cho đúng một thiết bị (khóa p256dh + auth của thiết bị đó). Tham số _test chỉ dùng khi kiểm thử.
export function encrypt(payload, keys, _test = {}) {
  const ua = unb64u(keys.p256dh), auth = unb64u(keys.auth);
  if (ua.length !== 65 || auth.length < 16) throw new Error('Khóa thiết bị không hợp lệ');
  const ecdh = crypto.createECDH('prime256v1');
  if (_test.asPrivate) ecdh.setPrivateKey(_test.asPrivate); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(); const shared = ecdh.computeSecret(ua);
  const prkKey = hmac(auth, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub, Buffer.from([1])]));
  const salt = _test.salt || crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(4096, 16); header.writeUInt8(65, 20);
  return Buffer.concat([header, asPub, ct]);
}

// Gửi tới một thiết bị. Trả về { ok, status, gone } (gone = thiết bị đã tắt/gỡ app → nên xóa đăng ký)
export async function sendPush(sub, data, vapid, subject, { ttl = 86400, fetchImpl = fetch } = {}) {
  const body = encrypt(JSON.stringify(data), sub.keys);
  const r = await fetchImpl(sub.endpoint, { method: 'POST', headers: { Authorization: vapidHeader(sub.endpoint, vapid, subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'normal' }, body });
  return { ok: r.status >= 200 && r.status < 300, status: r.status, gone: r.status === 404 || r.status === 410 };
}
