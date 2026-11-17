import { html, raw, openModal, closeModal, vnd, dmy, monthLabel, weekday, esc, $, toast } from '../util.js';
import { setBadge, badgeButton } from '../badge.js';
import { S, api, diagnose } from '../api.js';
import { APP_VERSION } from '../version.js';
import { lunarText } from '../lunar.js';
import { acts, forms, go } from '../ui.js';
import { usageBar, alertsHtml, footStrip, refreshStatus } from './strip.js';
import { a2hsButton, a2hsChip } from '../a2hs.js';
import { usagePanel } from './usage.js';
import { debtNotices } from './debts.js';
import { calendarPanel, eventBanner, eventsAheadList, eventsAhead } from './calendar.js';
import { icon, ROOM_ICON, ROOM_TONE } from '../icons.js';
import { ROOM_STATUS } from '../util.js';

const LEVEL = { red: 'red', orange: 'orange', blue: 'blue', green: 'green' };
// Thẻ VIỆC CẦN LÀM gọn: "Phòng – Khách – Ngày thanh toán" / "Cần làm: …" (chữ to) / 1 nút
const ym = (d) => `${Number(String(d).slice(5, 7))}/${String(d).slice(0, 4)}`;
export function todoText(it) {
  const m$ = (n) => vnd(n);
  if (it.type === 'need_readings') { const dl = it.daysLeft ?? 0; return [`Ghi điện nước tháng ${ym(it.dueDate)}`, dl > 0 ? `còn ${dl} ngày` : dl === 0 ? 'hôm nay' : `trễ ${-dl} ngày`]; }
  if (it.type === 'refund_pending') return [`Hoàn tiền cho khách ${m$(it.remaining)}`, 'đã trả phòng'];
  if (it.type === 'ended_debt') return [`Thu nợ ${m$(it.remaining)}`, 'khách đã trả phòng'];
  const months = it.months?.length ? it.months.map((x) => ym(x.ym + '-01')).join(', ') : ym(it.dueDate);
  return [`Thanh toán tháng ${months}${it.remaining ? ` – còn ${m$(it.remaining)}` : ''}`, it.type === 'overdue' ? 'quá hạn' : it.type === 'partial' ? 'đã trả một phần' : it.type === 'debt' ? 'có nợ cũ' : ''];
}
// Ghi chú dưới dòng "Cần làm": nợ cũ (kèm lý do) và tiền thu thêm (kèm nội dung, chữ đỏ)
export function noteLines(notes) {
  if (!notes?.length) return '';
  return html`<div class="t-notes">${notes.map((x) => (x.kind === 'note' ? html`<div class="t-n note">Ghi chú: <span>${x.text}</span></div>` : html`<div class="t-n ${x.kind}">${x.kind === 'debt' ? 'Nợ cũ' : x.amount < 0 ? 'Giảm trừ' : 'Thu thêm'}: <b>${vnd(Math.abs(x.amount))}</b> <span>(${x.text || (x.kind === 'debt' ? 'chưa ghi lý do' : 'Chi phí khác')})</span></div>`))}</div>`;
}
export function taskCard(it, { actions = false, tenantName = '', pub = false } = {}) {
  const [todo, note] = todoText(it); const payType = ['overdue', 'debt', 'unpaid', 'partial', 'ended_debt'].includes(it.type);
  const btn = !actions ? '' : it.type === 'need_readings' && it.rentalId ? html`<button class="btn red sm rbtn" data-act="readings" data-id="${it.rentalId}">${icon('bolt', '1.1em')} Tính tiền</button>`
    : payType && it.invoiceId ? html`<button class="btn green sm rbtn" data-act="pay" data-id="${it.invoiceId}">${icon('check', '1.1em')} Thanh toán</button>` : html`<button class="btn sm rbtn" data-act="open-room" data-id="${it.roomId}">Mở phòng</button>`;
  const open = pub && it.roomId ? raw(`data-act="pub-room" data-id="${esc(it.roomId)}" data-name="${esc(it.roomName)}" data-pay="${payType ? 1 : 0}"`) : !pub ? raw(`data-act="open-room" data-id="${esc(it.roomId)}"`) : '';
  return html`<article class="note task ${LEVEL[it.level] || ''} link" ${open}>
    <div class="t-line"><b class="t-room">${it.roomName}</b>${tenantName ? html` – <span class="t-name">${tenantName}</span>` : ''}</div>
    <div class="t-todo">Cần làm: <b>${todo}</b> <span class="t-note">(${dmy(it.dueDate)}${note ? ` - ${note}` : ''})</span></div>${noteLines(it.notes)}${btn ? html`<div class="nact">${btn}</div>` : ''}</article>`;
}
export function noticeCard(it, { link = false, tenantName = '', actions = false, pub = false } = {}) {
  const per = it.period || it.periodLabel; const m$ = (n) => html`<span class="money">${vnd(n)}</span>`;
  const rows = [];
  const duePay = (it.also || []).find((x) => x.startsWith('Đến hạn thanh toán'));
  if (it.type === 'need_readings') { const dl = it.daysLeft ?? 0; rows.push(['Kỳ thanh toán', monthLabel(per)], ['Việc cần làm', 'Ghi chỉ số điện nước → lập hóa đơn → thu tiền'], ['Ngày đến hạn', html`${dmy(it.dueDate)} <b class="${dl > 0 ? '' : 'owe'}">(${dl > 0 ? `còn ${dl} ngày` : dl === 0 ? 'hôm nay' : `trễ ${-dl} ngày`})</b>`]); }
  else if (it.type === 'upcoming') rows.push(['Kỳ thanh toán', monthLabel(per)], ['Trạng thái', 'Sắp đến ngày thu tiền'], ['Ngày đến hạn', dmy(it.dueDate)]);
  else if (it.type === 'refund_pending') rows.push(['Trạng thái', 'Cần hoàn tiền cho khách đã trả phòng'], ['Số tiền cần hoàn', m$(it.remaining)], ['Ngày trả phòng', dmy(it.dueDate)]);
  else { rows.push(['Kỳ thanh toán', monthLabel(per)], ['Trạng thái', it.label]); if (it.months?.length) rows.push(['Chưa thanh toán', it.months.map((m) => `Tháng ${Number(m.ym.slice(5))}`).join(', ')]); rows.push(['Tổng tiền', m$(it.total)], ['Đã thanh toán', m$(it.paid)], ['Còn phải thu', m$(it.remaining)], ['Ngày đến hạn', dmy(it.dueDate)]); }
  const paying = ['overdue', 'debt', 'unpaid', 'partial', 'ended_debt'].includes(it.type) && it.invoiceId;
  const btns = !actions ? '' : html`<div class="nact">${paying ? html`<button class="btn green sm" data-act="pay" data-id="${it.invoiceId}">${icon('check', '1.1em')} Đã nhận tiền</button><button class="btn sm" data-act="open-invoice" data-id="${it.invoiceId}">${icon('photo', '1.1em')} Xem hóa đơn</button>` : ''}${['need_readings', 'upcoming'].includes(it.type) && it.rentalId ? html`<button class="btn red sm" data-act="readings" data-id="${it.rentalId}">${icon('bolt', '1.1em')} Tính tiền</button>` : ''}${it.type === 'refund_pending' && it.recordId ? html`<button class="btn green sm" data-act="refunded" data-id="${it.recordId}">${icon('check', '1.1em')} Đã hoàn tiền</button>` : ''}</div>`;
  const payType = ['overdue', 'debt', 'unpaid', 'partial', 'ended_debt'].includes(it.type);
  return html`<article class="note ${LEVEL[it.level] || ''} ${link || pub ? 'link' : ''}" ${link ? raw(`data-act="open-room" data-id="${esc(it.roomId)}"`) : pub && it.roomId ? raw(`data-act="pub-room" data-id="${esc(it.roomId)}" data-name="${esc(it.roomName)}" data-pay="${payType ? 1 : 0}"`) : ''}>
    <h3>${String(it.roomName).toUpperCase()}${tenantName ? html` <span class="muted small">· ${tenantName}</span>` : ''}</h3>
    <dl>${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>${noteLines(it.notes)}
    ${(it.also || []).filter((x) => x !== duePay || it.type !== 'need_readings').length ? html`<div class="also">Đồng thời: ${(it.also || []).filter((x) => x !== duePay || it.type !== 'need_readings').join('; ')}</div>` : ''}${btns}</article>`;
}

function rosterCard(r) {
  const tone = ROOM_TONE[r.status];
  return html`<article class="card click room-card st-${tone}" data-act="pub-room" data-id="${r.roomId}" data-name="${r.roomName}">${r.status === 'notready' ? html`<span class="lockmark">${icon('lock', '100%')}</span>` : ['occupied', 'empty'].includes(r.status) ? html`<span class="lockmark open">${icon('unlock', '100%')}</span>` : ''}<div class="rhead"><span class="rbadge ${tone}">${raw(icon(ROOM_ICON[r.status], '1.6em'))}</span><div class="sp"><h3>${r.roomName}</h3><span class="stx ${tone}">${ROOM_STATUS[r.status]}${r.startDate ? html` <span class="room-sub">· Vào ${dmy(r.startDate)}</span>` : ''}</span></div></div>
    ${r.startDate ? html`<dl class="kv">${r.tenantName !== undefined ? html`<dt>Khách thuê</dt><dd class="big">${r.tenantName}</dd>` : ''}<dt>Số người</dt><dd>${r.people}</dd><dt>Còn nợ</dt><dd class="${r.debt ? 'owe' : 'okc'}">${vnd(r.debt)}</dd>${r.note ? html`<dt>Ghi chú</dt><dd>${r.note}</dd>` : ''}</dl>` : r.note && r.status !== 'empty' ? html`<p class="muted" style="margin:6px 0 0">${r.note}</p>` : ''}</article>`;
}
// Nhắc ghi điện nước: phòng đã tới/qua ngày ghi và phòng sắp tới ngày ghi (tính theo ngày nhận phòng của từng khách)
export function readingsBanner(rd) {
  const due = rd?.due || [], soon = rd?.soon || []; if (!due.length && !soon.length) return html``;
  return html`<div class="rdnote"><b>${icon('bolt', '1.15em')} Nhắc ghi điện nước</b>${due.length ? html`<div class="rdline due"><span>Đã tới ngày ghi:</span>${due.map((x) => html`<span class="rdchip">${x.roomName} <small>· ${x.daysLate ? `trễ ${x.daysLate} ngày` : 'hôm nay'} (${dmy(x.dueDate)})</small></span>`)}</div>` : ''}${soon.length ? html`<div class="rdline soon"><span>Sắp tới ngày ghi:</span>${soon.map((x) => html`<span class="rdchip">${x.roomName} <small>· còn ${x.daysLeft} ngày (${dmy(x.dueDate)})</small></span>`)}</div>` : ''}</div>`;
}
export function dateBlock(today, events) {
  const ahead = eventsAhead(events || [], today).slice(0, 4);
  return html`<div class="dt">${weekday(today)}, ${dmy(today)}<br>Âm lịch: ${lunarText(today)}</div>${ahead.length ? html`<div class="hdr-events">${ahead.map((u) => html`<span>${icon('star', '1em')} ${u.ev.name} – ${dmy(u.date).slice(0, 5)} (${u.left === 0 ? 'hôm nay' : `còn ${u.left} ngày`})</span>`)}</div>` : ''}`;
}

export async function publicView(app) {
  app.innerHTML = html`<div class="top pubtop"><div class="in"><div class="tl"><h1 class="apptitle"><span class="t1">PHÒNG TRỌ 70</span> <span class="t2">HOÀNG SÂM</span><span class="credit">BusCafe</span></h1><div id="ubar">${usageBar(null)}</div><div id="alerts"></div><div id="pubdate"></div></div>
    <div class="tr"><span id="a2hschip">${a2hsChip()}${badgeButton()}</span><a class="bell zero" id="pubbell" href="#pubnotices" data-act="pub-bell" title="Việc cần xử lý">${icon('bell', '1.25em')}<span class="bn">0</span></a><a class="btn sm primary login-btn" href="#/login">${icon('login', '1.1em')} Đăng nhập</a></div></div></div>
    <main class="wrap"><div id="pubbanner"></div><div id="pubbody"><p class="boot">Đang tải thông báo…</p></div>
    <div id="a2hs">${a2hsButton()}</div>
    <footer class="page-foot"><div id="footstrip"></div><div class="upd" id="upd"></div><div class="upd">Phiên bản giao diện: ${APP_VERSION}</div></footer></main>`.s;
  await loadPublic();
}
const CACHE = 'pt70_pub_v1'; // chỉ lưu dữ liệu thông báo ĐÃ LỌC (không có thông tin khách) để mở trang là hiện ngay / xem được khi mất mạng
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)); } catch { return null; } };
function paint(res, note = '') {
  const body = $('#pubbody'); if (!body) return;
  S.pub = res; const s = res.summary, items = res.items;
  $('#pubbanner').innerHTML = eventBanner(res.events, res.today).s;
  $('#pubdate').innerHTML = dateBlock(res.today, res.events).s; refreshStatus(res.system);
  const cnt = res.badgeCount ?? items.filter((x) => x.type !== 'upcoming').length; // MỘT con số chung: chuông ngoài = chuông trong = icon app
  const bn = $('#pubbell'); if (bn) { bn.querySelector('.bn').textContent = String(cnt); bn.classList.toggle('zero', !cnt); }
  setBadge(cnt);
  // Cùng thứ tự, cùng kiểu chữ / màu với trang quản lý (Tổng quan)
  const tk = res.tasks || { total: cnt }; const tasks = items.filter((i) => i.type !== 'upcoming');
  const sum = [tk.readings ? `Ghi điện nước: <b>${tk.readings}</b>` : '', tk.rooms ? `Thu tiền phòng: <b>${tk.rooms}</b>` : '', tk.debts ? `Nhắc nợ riêng: <b>${tk.debts}</b>` : '', tk.phones ? `Số điện thoại: <b>${tk.phones}</b>` : '', tk.leaks ? `Cảnh báo điện nước: <b>${tk.leaks}</b>` : ''].filter(Boolean);
  body.innerHTML = html`<h2 class="sec sumrow" id="pubnotices" style="margin-top:4px"><span>Việc cần xử lý (${cnt})</span>${cnt ? '' : html`<span class="okpill">${icon('check', '1.1em')} Đã xử lý hết – không có việc cần làm</span>`}</h2>
    ${sum.length ? html`<p class="task-sum">${raw(sum.join(' · '))}</p>` : ''}
    ${tasks.length ? html`<div class="notices tasks" style="margin-top:0">${tasks.map((i) => taskCard(i, { pub: true, tenantName: i.tenantName || '' }))}</div>` : ''}
    ${debtNotices(res.debts?.items.map((d) => ({ ...d })) || [], { actions: false })}
    ${eventsAheadList(res.events, res.today)}
    <h2 class="sec">Tổng quan</h2>
    <div class="cards7"><div class="stat roomstat"><b>${s.rooms}</b><span>Tổng số phòng</span><span class="sub blk">Phòng đang khóa: <b class="inl">${(res.roster || []).filter((r) => r.status === 'notready').length}</b></span></div><div class="stat redtxt"><b>${s.unpaidRooms}</b><span>Phòng cần thu tiền</span></div><div class="stat debt"><b>${vnd(s.totalRemaining)}</b><span>Tổng công nợ</span></div></div>
    ${readingsBanner(res.readings)}
    <div class="section-head"><h2 class="sec">Các phòng</h2></div>
    <div class="grid">${(res.roster || []).map(rosterCard)}</div>
    <div class="dash-cal">${calendarPanel()}</div>
    ${usagePanel(res.usage)}`.s;
  const u = $('#upd'); if (u) u.textContent = note || `Cập nhật lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}
export async function loadPublic() {
  const body = $('#pubbody'); if (!body) return;
  const cached = readCache(); if (cached && !S.pub) paint(cached.res, `Đang cập nhật… (bản lưu lúc ${new Date(cached.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})`);
  try {
    const res = await api('GET', 'public/reminders'); S.pub = res; paint(res);
    try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), res })); } catch { /* bộ nhớ trình duyệt đầy/bị chặn: bỏ qua */ }
  } catch (e) {
    const sp = $('#alerts'); if (sp) sp.innerHTML = alertsHtml({ alerts: [{ level: 'red', text: e.message }] }).s;
    if (cached) paint(cached.res, `Không kết nối được máy chủ – đang hiển thị bản lưu trên máy lúc ${new Date(cached.at).toLocaleString('vi-VN')}`);
    else {
      body.innerHTML = html`<div class="err-box"><b>Chưa tải được thông báo.</b><br>${e.message}<div id="diag" class="small" style="margin-top:8px"></div><button class="btn sm" data-act="reload-public" style="margin-top:8px">Thử lại</button></div>`.s;
      diagnose().then((l) => { const d = $('#diag'); if (d) d.innerHTML = html`<b>Tự kiểm tra:</b><br>${l.map((x) => html`${x}<br>`)}`.s; });
    }
  }
}
acts['reload-public'] = () => loadPublic();

export function loginView(app) {
  app.innerHTML = html`<main class="login"><h1 class="apptitle"><span class="t1">PHÒNG TRỌ 70</span> <span class="t2">HOÀNG SÂM</span><span class="credit">BusCafe</span></h1>
    <form data-form="login" autocomplete="on"><input type="password" name="password" placeholder="Nhập mật khẩu" autocomplete="current-password" required autofocus aria-label="Mật khẩu">
    <div class="msg err-inline" role="alert"></div><button class="btn primary block" type="submit">ĐĂNG NHẬP</button>
    <a href="#/" class="muted small">← Xem thông báo</a></form></main>`.s;
}
forms.login = async (f, fd) => {
  const j = await api('POST', 'auth/login', { password: fd.get('password') });
  S.loggedIn = true; S.csrf = j.csrf; S.snap = null; try { sessionStorage.setItem('pt70_tab', '1'); } catch { /* chỉ là cờ, không chứa bí mật */ }
  const to = S.afterLogin || '#/dashboard'; S.afterLogin = null; go(to);
  if (S.afterLoginAct) { const a = S.afterLoginAct; S.afterLoginAct = null; const wait = setInterval(() => { if (S.snap) { clearInterval(wait); acts[a]?.({ dataset: {} }); } }, 200); setTimeout(() => clearInterval(wait), 8000); }
};
acts['pub-room'] = (el) => openModal(el.dataset.pay === '1' ? `Đăng nhập để thanh toán – ${el.dataset.name}` : `Đăng nhập để xem ${el.dataset.name}`, html`<p style="margin-top:0">${el.dataset.pay === '1' ? html`<b>${el.dataset.name}</b> đang còn khoản phải thu. Bạn cần <b>đăng nhập</b> để xem hóa đơn và <b>thanh toán</b>.` : html`Bạn cần <b>đăng nhập</b> mới xem được chi tiết <b>${el.dataset.name}</b>.`}</p><button class="btn primary block" data-act="pub-login" data-target="#/room/${el.dataset.id}">${icon('login', '1.2em')} Đăng nhập</button>`);
acts['pub-bell'] = (el) => { const t = $('#pubnotices'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
acts['pub-login'] = (el) => { S.afterLogin = el.dataset.target || null; closeModal(); go('#/login'); };
acts['pub-add-event'] = () => { S.afterLogin = '#/dashboard'; S.afterLoginAct = 'ev-add'; openModal('Nhập mật khẩu để thêm sự kiện', html`<form data-form="login"><input type="password" name="password" placeholder="Nhập mật khẩu" autocomplete="current-password" required autofocus aria-label="Mật khẩu"><div class="err-inline"></div><button class="btn primary block" type="submit">${icon('login', '1.2em')} ĐĂNG NHẬP & THÊM SỰ KIỆN</button></form>`); };
