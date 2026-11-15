import { html, raw, vnd, dmy, field, toast, download, $, monthLabel, openModal } from '../util.js';
import { api, apiUrl, D, S, save, today } from '../api.js';
import { icon } from '../icons.js';
import { GAS } from '../gas-code.js';
import { backupCccd, restoreCccd, cccdItems } from '../cccd-backup.js';

import { acts, forms, changes, rerender } from '../ui.js';

let logLimit = 10; // nhật ký: chỉ hiện 10 dòng mới nhất, bấm "Xem thêm" để hiện tiếp
const HK = 'pt70_hidden_rows'; const hidden = () => { try { return new Set(JSON.parse(localStorage.getItem(HK) || '[]')); } catch { return new Set(); } }; const setHidden = (h) => { try { localStorage.setItem(HK, JSON.stringify([...h])); } catch { /* bỏ qua */ } };
let range = null; let last = null;
export function reportsView() {
  range = range || { from: `${today().slice(0, 4)}-01-01`, to: today() };
  const v = html`<div class="page-head"><h2>Báo Cáo Tiền Trọ</h2></div>
    <form data-form="report" class="row noprint" style="align-items:end"><div style="flex:1;min-width:140px">${field('Từ ngày', html`<input type="date" name="from" value="${range.from}" required>`)}</div><div style="flex:1;min-width:140px">${field('Đến ngày', html`<input type="date" name="to" value="${range.to}" required>`)}</div><button class="btn primary" type="submit" style="margin-bottom:12px">Xem báo cáo</button></form>
    <div id="rep"><p class="boot">Đang tính…</p></div>`;
  v.after = loadReport; return v;
}
let repMode = 'month'; // xem theo tháng | theo phòng
const TYPE = { first: 'Tiền phòng đầu kỳ (khi vào ở)', month: 'Tiền phòng + điện nước', rentOnly: 'Tiền phòng (chưa ghi điện nước)', checkout: 'Trả phòng (quyết toán)', transfer: 'Chốt phòng cũ (chuyển phòng)' };
const STATUS = { paid: ['green', 'Đã thu đủ'], partial: ['orange', 'Thu một phần'], unpaid: ['red', 'Chưa thu'], refund: ['blue', 'Hoàn lại khách'] };
const meter = (m, unit) => (m ? html`${vnd(m.amount)}<span class="rp-sub">${m.old} → ${m.new} = ${m.usage} ${unit} × ${vnd(m.price)}</span>` : html`<span class="muted">—</span>`);
const sumOf = (rows) => rows.reduce((a, d) => ({ rent: a.rent + d.rent, elec: a.elec + (d.elec?.amount || 0), water: a.water + (d.water?.amount || 0), other: a.other + d.extras + d.oldDebtAdd - d.deposit, own: a.own + Math.max(0, d.own), paid: a.paid + d.paid, out: a.out + d.outstanding, first: a.first + (d.type === 'first' ? d.rent : 0), firstPaid: a.firstPaid + (d.type === 'first' ? Math.min(d.paid, d.rent) : 0) }), { rent: 0, elec: 0, water: 0, other: 0, own: 0, paid: 0, out: 0, first: 0, firstPaid: 0 });
function detailRow(d, by) {
  const [tone, st] = STATUS[d.status] || ['gray', d.status];
  const other = d.extras + d.oldDebtAdd - d.deposit;
  const td = (l, v, cls = '') => html`<td data-l="${l}" class="${cls}"><span class="rp-v">${v}</span></td>`; // bọc nội dung để trên điện thoại chữ phụ nằm dưới số tiền
  return html`<tr class="rp-${d.status}">${by === 'month' ? td('Phòng', html`<b>${d.room}</b><span class="rp-sub">${d.tenant}</span>`) : td('Tháng', html`<b>${monthLabel(d.ym)}</b><span class="rp-sub">${d.tenant}</span>`)}
    ${td('Khoản thu', html`<span class="rp-type ${d.type}">${TYPE[d.type] || d.type}</span><span class="rp-sub">Hạn thu ${dmy(d.dueDate)}</span>`)}
    ${td('Tiền phòng', vnd(d.rent), 'r')}${td('Tiền điện', meter(d.elec, 'số'), 'r')}${td('Tiền nước', meter(d.water, 'khối'), 'r')}
    ${td('Khác / nợ cũ', other ? html`${vnd(other)}${d.oldDebtAdd ? html`<span class="rp-sub">Nợ cũ ${vnd(d.oldDebtAdd)}${d.oldDebtNote ? ` (${d.oldDebtNote})` : ''}</span>` : ''}${d.deposit ? html`<span class="rp-sub">Trừ cọc ${vnd(d.deposit)}</span>` : ''}` : html`<span class="muted">—</span>`, 'r')}
    ${td('Tổng tiền', html`<b>${vnd(d.own)}</b>`, 'r')}${td('Đã thu', html`${vnd(d.paid)}${d.payDates.length ? html`<span class="rp-sub">ngày thu ${d.payDates.map((x) => dmy(x).slice(0, 5)).join(', ')}</span>` : ''}`, 'r okc')}
    ${td('Còn thiếu', vnd(d.outstanding), `r ${d.outstanding ? 'owe' : ''}`)}${td('Trạng thái', html`<span class="badge ${tone}">${st}</span>`)}</tr>`;
}
const groupHead = (title, sm, key) => html`<div class="rp-head"><h3>${title}</h3><span class="rp-tot"><span>Tổng <b>${vnd(sm.own)}</b></span><span>Đã thu <b class="okc">${vnd(sm.paid)}</b></span><span>Còn thiếu <b class="${sm.out ? 'owe' : ''}">${vnd(sm.out)}</b></span></span><button class="btn sm danger noprint" data-act="hide-row" data-key="${key}" title="Ẩn khỏi báo cáo">${icon('trash', '1em')} Ẩn</button></div>`;
function groupTable(rows, by) {
  return html`<table class="tbl stack rp-tbl"><thead><tr><th>${by === 'month' ? 'Phòng / khách' : 'Tháng / khách'}</th><th>Khoản thu</th><th class="r">Tiền phòng</th><th class="r">Tiền điện</th><th class="r">Tiền nước</th><th class="r">Khác / nợ cũ</th><th class="r">Tổng tiền</th><th class="r">Đã thu</th><th class="r">Còn thiếu</th><th>Trạng thái</th></tr></thead><tbody>${rows.map((d) => detailRow(d, by))}</tbody></table>`;
}
async function loadReport() {
  const box = $('#rep'); if (!box) return;
  try {
    const r = await api('GET', `reports?from=${range.from}&to=${range.to}`); last = r;
    const h = hidden(); const all = r.details || [];
    const rows = all.filter((d) => !h.has(`m:${d.ym}`) && !h.has(`r:${d.room}`)); const nHidden = [...h].filter((k) => all.some((d) => k === `m:${d.ym}` || k === `r:${d.room}`)).length;
    const t = sumOf(rows); const cash = r.months.reduce((a, m) => a + m.collected, 0);
    const months = [...new Set(rows.map((d) => d.ym))].sort().reverse(); const rooms = [...new Set(rows.map((d) => d.room))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
    const stat = (v, l, cls = '') => html`<div class="stat ${cls}"><b>${vnd(v)}</b><span>${l}</span></div>`;
    box.innerHTML = html`${nHidden ? html`<div class="warn-box">Đang ẩn <b>${nHidden}</b> nhóm khỏi báo cáo này (chỉ ẩn trên màn hình, sổ sách không thay đổi). <button class="btn sm" data-act="show-rows">Hiện lại tất cả</button></div>` : ''}
    <div class="cards7">${stat(t.first, `Tiền phòng đầu kỳ khi vào ở (đã thu ${vnd(t.firstPaid)})`)}${stat(t.rent, 'Tổng tiền phòng')}${stat(t.elec, 'Tổng tiền điện')}${stat(t.water, 'Tổng tiền nước')}${stat(t.own, 'Tổng tiền các tháng')}${stat(t.paid, 'Đã thu của các tháng này', 'ok')}${stat(t.out, 'Còn thiếu của các tháng này', 'debt')}${stat(cash, 'Tiền thực nhận trong khoảng ngày (theo ngày thu)')}<div class="stat debt"><b>${vnd(r.debtNow)}</b><span>Tổng công nợ hiện tại</span></div></div>
    <div class="seg noprint" role="tablist"><button class="btn ${repMode === 'month' ? 'primary' : ''}" data-act="rep-mode" data-mode="month">Xem theo tháng</button><button class="btn ${repMode === 'room' ? 'primary' : ''}" data-act="rep-mode" data-mode="room">Xem theo phòng</button></div>
    ${!rows.length ? html`<div class="empty-state">Không có hóa đơn nào trong khoảng ngày này.</div>` : repMode === 'month'
      ? months.map((ym) => { const g = rows.filter((d) => d.ym === ym); return html`<section class="rp-group">${groupHead(monthLabel(ym), sumOf(g), `m:${ym}`)}${groupTable(g, 'month')}</section>`; })
      : rooms.map((rm) => { const g = rows.filter((d) => d.room === rm); return html`<section class="rp-group">${groupHead(rm, sumOf(g), `r:${rm}`)}${groupTable(g, 'room')}</section>`; })}
    <p class="muted small">Mỗi dòng là tiền của <b>chính tháng đó</b> (không cộng nợ chuyển từ tháng trước, để không đếm hai lần). "Đã thu" là số đã trả cho tháng đó; "Còn thiếu" là phần chưa trả. Tháng tính theo ngày đến hạn thu. "Tiền thực nhận trong khoảng ngày" tính theo ngày khách trả tiền.</p>
    <div class="row noprint"><button class="btn" data-act="rep-csv">⬇ Xuất Excel (CSV)</button><button class="btn" data-act="rep-json">⬇ Xuất JSON</button><button class="btn" data-act="print">🖨 In báo cáo</button></div>`.s;
  } catch (e) { box.innerHTML = html`<div class="err-box">${e.message}</div>`.s; }
}
acts['rep-mode'] = (el) => { repMode = el.dataset.mode; loadReport(); };
forms.report = async (f, fd) => { range = { from: fd.get('from'), to: fd.get('to') }; await loadReport(); };
const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
acts['rep-csv'] = () => {
  const rows = [['Tháng', 'Phòng', 'Khách', 'Khoản thu', 'Hạn thu', 'Tiền phòng', 'Số điện dùng', 'Tiền điện', 'Số nước dùng', 'Tiền nước', 'Khác / nợ cũ', 'Tổng tiền', 'Đã thu', 'Còn thiếu', 'Trạng thái', 'Ngày thu'],
    ...(last.details || []).map((d) => [d.ym, d.room, d.tenant, TYPE[d.type] || d.type, d.dueDate, d.rent, d.elec?.usage ?? '', d.elec?.amount || 0, d.water?.usage ?? '', d.water?.amount || 0, d.extras + d.oldDebtAdd - d.deposit, d.own, d.paid, d.outstanding, (STATUS[d.status] || [, d.status])[1], d.payDates.join(' ')])];
  download(`bao-cao-${last.from}-${last.to}.csv`, '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
};
acts['rep-json'] = () => download(`bao-cao-${last.from}-${last.to}.json`, JSON.stringify(last, null, 1));

export function backupView() {
  const allLogs = D().activityLogs.slice().reverse(); const logs = allLogs.slice(0, logLimit);
  return html`<div class="page-head"><h2>Sao lưu & khôi phục</h2></div>
    <section class="card"><h3>Sao lưu dữ liệu</h3><p class="muted">Tải toàn bộ dữ liệu (không gồm ảnh CCCD) về máy. Nên làm mỗi tháng và cất ở nơi khác (Google Drive, email…). Hệ thống cũng tự lưu bản sao mỗi tháng ngay trong cơ sở dữ liệu Upstash (cùng nhà cung cấp, nên không thay được bản bạn tự tải).</p>
      <div class="row"><a class="btn primary" href="${apiUrl('backup/export')}" download>⬇ Tải database.json (để khôi phục)</a><a class="btn" href="${apiUrl('backup/export-xlsx')}" download>⬇ Tải file Excel (để xem, dạng bảng)</a></div><p class="muted small" style="margin:8px 0 0">File Excel có các sheet: Phòng, Hóa đơn, Thanh toán, Khách thuê, Người ở cùng, Lượt thuê, Đồng hồ tổng, Sự kiện. Chỉ để xem và lưu trữ; muốn khôi phục phải dùng file database.json. Hai file chứa thông tin cá nhân khách, hãy cất ở nơi riêng tư.</p></section>
    <section class="card" style="margin-top:12px"><h3>Khôi phục từ file JSON</h3><p class="warn-box">⚠ Khôi phục sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại. Hệ thống tự lưu một bản an toàn của dữ liệu hiện tại trước khi ghi đè.</p>
      <form data-form="restore"><input type="file" name="file" accept="application/json,.json" required style="margin-bottom:12px"><div id="rsum" class="calc" hidden></div>${field('Gõ chính xác: GHI DE để xác nhận', html`<input name="confirm" autocomplete="off" placeholder="GHI DE">`)}<div class="err-inline"></div><button class="btn danger" type="submit">KIỂM TRA & KHÔI PHỤC</button></form></section>
    ${sheetCard()}
    ${settingsCard()}
    ${cleanupCard()}
    ${cccdCard()}
    <section class="card" style="margin-top:12px"><h3>Kiểm tra tất cả kết nối</h3><p class="muted small" style="margin:6px 0">Thử đọc cơ sở dữ liệu, ghi/xóa một file thử trong kho ảnh và hỏi Google Sheet.</p><button class="btn primary sm" data-act="sys-check">Kiểm tra tất cả kết nối</button><div id="syscheck" style="margin-top:10px"></div></section>
    <h2 class="sec">Nhật ký thao tác gần đây</h2><div class="list" id="loglist">${logs.map((l) => html`<div class="li"><span><b>${l.action}</b> <span class="muted">${l.detail}</span></span><span class="muted small">${l.at.slice(0, 16).replace('T', ' ')}</span></div>`)}</div>
    <div class="row" style="margin-top:10px">${allLogs.length > logLimit ? html`<button class="btn" data-act="logs-more">Xem thêm (còn ${allLogs.length - logLimit} dòng)</button>` : ''}${logLimit > 10 ? html`<button class="btn" data-act="logs-less">Thu gọn (10 dòng mới nhất)</button>` : ''}</div>`;
}
forms.restore = async (f, fd) => {
  const file = fd.get('file'); if (!file || !file.size) throw new Error('Chưa chọn file');
  let db; try { db = JSON.parse(await file.text()); } catch { throw new Error('File không phải JSON hợp lệ'); }
  if (db.schemaVersion !== 1 || !Array.isArray(db.rooms) || !Array.isArray(db.invoices)) throw new Error('File không đúng định dạng dữ liệu Phòng Trọ 70');
  const s = $('#rsum'); s.hidden = false; s.textContent = `File có ${db.rooms.length} phòng, ${db.tenants.length} khách, ${db.invoices.length} hóa đơn, ${db.payments.length} giao dịch; lưu lúc ${db.updatedAt}.`;
  if (fd.get('confirm') !== 'GHI DE') throw new Error('Kiểm tra file xong. Gõ đúng "GHI DE" vào ô xác nhận rồi bấm lại để khôi phục.');
  if (!confirm('Chắc chắn GHI ĐÈ toàn bộ dữ liệu hiện tại bằng file này?')) return;
  const j = await save('POST', 'backup/restore', { db, confirm: 'GHI DE' }, 'Đã khôi phục dữ liệu'); rerender();
  const im = j.images || {}; if (im.checked) setTimeout(() => toast(`Ảnh căn cước: nối lại ${im.linked || 0} ảnh còn trong kho${im.kept ? `, ${im.kept} ảnh vẫn dùng được` : ''}${im.missing ? `, ${im.missing} ảnh không còn trong kho (dùng "Khôi phục ảnh căn cước từ file backup")` : ''}`, im.missing ? 'err' : undefined), 1500);
};

const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
function cleanupCard() {
  const st = S.snap.system.storage; const ok = st.eligible.filter((e) => !e.blocked); const hold = st.eligible.filter((e) => e.blocked);
  return html`<section class="card" style="margin-top:12px"><h3>Dung lượng & dọn dữ liệu cũ</h3>
    <p style="margin:6px 0">Ảnh CCCD: <b>${mb(st.usedBytes)}</b> / ${mb(st.limitBytes)} (<b class="${st.pct >= 90 ? 'owe' : ''}">${st.pct}%</b>) · ${st.imageCount} ảnh · dữ liệu JSON ~${(st.dbBytes / 1024).toFixed(0)} KB</p>
    <p class="muted small">Chỉ dọn khách <b>đã trả phòng từ ${dmy(st.cutoff)} trở về trước</b>. Khách đang thuê không bao giờ bị xóa. Sẽ xóa: ảnh CCCD, họ tên, ngày sinh, SĐT, CCCD, địa chỉ, người ở cùng. Giữ lại số tiền hóa đơn/thanh toán để báo cáo doanh thu không sai (tên hiện là "(Đã xóa hồ sơ)"). Không thể hoàn tác.</p>
    ${ok.length ? html`<div class="list">${ok.map((e) => html`<div class="li"><span><b>${e.name}</b> · ${e.room} · trả phòng ${dmy(e.lastEnd)}</span><span class="muted small">${mb(e.bytes)}</span></div>`)}</div>
      <button class="btn danger" style="margin-top:10px" data-act="cleanup-run">🗑 XÓA DỮ LIỆU ${ok.length} KHÁCH CŨ (giải phóng ${mb(ok.reduce((s, e) => s + e.bytes, 0))})</button>` : html`<div class="empty-state">Chưa có hồ sơ nào đủ điều kiện xóa.</div>`}
    ${hold.length ? html`<p class="muted small" style="margin-top:10px">Đang giữ lại vì chưa đủ điều kiện: ${hold.map((e) => `${e.name} (${e.blocked})`).join('; ')}.</p>` : ''}</section>`;
}
acts['cleanup-run'] = async (el) => {
  const st = S.snap.system.storage; const n = st.eligible.filter((e) => !e.blocked).length;
  if (!confirm(`Xóa vĩnh viễn dữ liệu cá nhân và ảnh CCCD của ${n} khách đã trả phòng quá 2 năm?\n\nHệ thống sẽ tải về một bản sao lưu trước khi xóa. Không thể hoàn tác.`)) return;
  const res = await api('GET', 'backup/export', undefined, { raw: true }); if (!res.ok) throw new Error('Không tải được bản sao lưu nên chưa xóa gì.');
  download(`truoc-khi-don-${today()}.json`, await res.text());
  el.disabled = true;
  try { const j = await save('POST', 'cleanup', { confirm: 'XOA' }, null); toast(`Đã xóa ${j.purged} hồ sơ, ${j.imagesDeleted} ảnh${j.imagesFailed ? ` (${j.imagesFailed} ảnh chưa xóa được, thử lại sau)` : ''}`); rerender(); } finally { el.disabled = false; }
};

function settingsCard() {
  const on = S.snap.settings?.publicShowTenant !== false;
  return html`<section class="card" style="margin-top:12px"><h3>Hiển thị trên trang ngoài (chưa đăng nhập)</h3>
    <p class="muted small">Trang ngoài luôn hiện: số phòng, số tiền phải thu, ngày vào, số người, nợ. Tùy chọn dưới đây điều khiển việc hiện <b>họ tên khách</b> và <b>ghi chú của tháng</b>. Số điện thoại, CCCD, ngày sinh, địa chỉ, tên người ở cùng thì KHÔNG BAO GIỜ hiện. Ai biết địa chỉ web đều xem được trang ngoài.</p>
    <label class="radios"><input type="checkbox" data-change="set-public" ${on ? raw('checked') : ''}> Hiện họ tên khách và ghi chú trên trang ngoài</label>
    <label class="radios"><input type="checkbox" data-change="set-events" ${S.snap.settings?.publicShowEvents !== false ? raw('checked') : ''}> Hiện tên và ngày các sự kiện trên lịch ở trang ngoài (ghi chú sự kiện luôn ẩn)</label></section>`;
}
changes['set-public'] = async (el) => { await save('PUT', 'settings', { publicShowTenant: el.checked }, el.checked ? 'Trang ngoài sẽ hiện họ tên khách và ghi chú' : 'Trang ngoài đã ẩn họ tên khách và ghi chú'); rerender(); };

changes['set-events'] = async (el) => { await save('PUT', 'settings', { publicShowEvents: el.checked }, el.checked ? 'Trang ngoài sẽ hiện sự kiện' : 'Trang ngoài đã ẩn sự kiện'); rerender(); };
changes['set-personal'] = async (el) => { await save('PUT', 'settings', { sheetIncludePersonal: el.checked }, el.checked ? 'Sẽ gửi cả thông tin cá nhân khách vào Google Sheet' : 'Sẽ KHÔNG gửi SĐT/CCCD/địa chỉ vào Google Sheet'); rerender(); };
function sheetCard() {
  const sh = S.snap.sheets || {}; const personal = S.snap.settings?.sheetIncludePersonal !== false;
  const fm = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN') : '');
  return html`<section class="card" style="margin-top:12px"><h3>${raw(icon('sheet', '1.2em'))} Sao lưu vào Google Sheet (chỉ thêm dòng, không xóa)</h3>
    <p class="muted small" style="margin:6px 0">Mỗi khi bạn lưu dữ liệu (hóa đơn, thanh toán, khách, sự kiện…), hệ thống tự THÊM dòng mới vào Google Sheet trong Gmail của bạn; mỗi ngày thêm 1 bản sao lưu đầy đủ. Không có thao tác xóa hay sửa dòng cũ.</p>
    ${sh.configured ? html`<div class="calc">${raw(icon('check'))} Đã cấu hình kết nối.${sh.lastOkAt ? ` Gửi thành công lúc ${fm(sh.lastOkAt)}.` : ' Chưa gửi lần nào kể từ khi máy chủ khởi động.'}${sh.lastError ? html`<br><b style="color:var(--red-t)">Lỗi gần nhất: ${sh.lastError}</b>` : ''}</div>
      <div class="row"><button class="btn sm" data-act="sheet-ping">Kiểm tra kết nối</button><button class="btn sm" data-act="sheet-test">Gửi dòng thử</button><button class="btn sm" data-act="sheet-snap">Sao lưu đầy đủ ngay</button><button class="btn sm" data-act="sheet-all">Gửi toàn bộ chi tiết (làm 1 lần)</button></div>
      <div id="sheetout" class="small" style="margin-top:10px"></div>
      <label class="radios"><input type="checkbox" data-change="set-personal" ${personal ? raw('checked') : ''}> Gửi cả thông tin cá nhân khách (SĐT, CCCD, ngày sinh, địa chỉ) vào Google Sheet</label>
      <p class="muted small" style="margin:0">Giữ Google Sheet ở chế độ riêng tư (đừng chia sẻ). Ảnh CCCD không được gửi vào Google Sheet.</p>`
    : html`<div class="warn-box">Chưa kết nối. Làm theo 4 bước ngay bên dưới (khoảng 10 phút).</div>`}
    <details class="gs-help" ${sh.configured ? '' : raw('open')}><summary>${sh.configured ? 'Xem lại hướng dẫn kết nối + mã Apps Script' : 'Hướng dẫn kết nối 4 bước + mã Apps Script (bấm để mở)'}</summary>
      <ol class="small" style="padding-left:20px;line-height:1.6">
        <li><b>Tạo mã bí mật:</b> bấm nút <b>Tạo mã bí mật</b> bên dưới (ghi lại mã này).</li>
        <li><b>Tạo Google Sheet:</b> vào <a href="https://sheets.google.com" target="_blank" rel="noopener">sheets.google.com</a> bằng Gmail của bạn → <b>Trống</b>. Menu <b>Tiện ích → Apps Script</b> → bấm vào khung code, <b>Ctrl+A</b>, <b>Delete</b>, rồi bấm <b>Sao chép mã Apps Script</b> bên dưới và <b>Ctrl+V</b> dán vào → bấm biểu tượng đĩa mềm <b>Lưu</b>.</li>
        <li><b>Triển khai:</b> nút xanh <b>Triển khai → Tùy chọn triển khai mới</b> → bánh răng ⚙ chọn <b>Ứng dụng web</b> → <b>Thực thi dưới dạng: Tôi</b>, <b>Quyền truy cập: Bất kỳ ai</b> → <b>Triển khai</b> → <b>Cấp quyền truy cập</b> (nếu Google cảnh báo: <b>Nâng cao → Đi tới … → Cho phép</b>) → <b>Sao chép URL ứng dụng web</b> (kết thúc bằng /exec).</li>
        <li><b>Khai báo trên Vercel:</b> Settings → Environment Variables → thêm <code>GOOGLE_SHEET_WEBHOOK_URL</code> = URL vừa sao chép và <code>GOOGLE_SHEET_SECRET</code> = mã bí mật ở bước 1 → Deployments → ⋯ → Redeploy. Quay lại đây bấm <b>Kiểm tra kết nối</b>.</li></ol>
      <div class="row" style="margin-bottom:8px"><button class="btn sm" data-act="gas-secret">Tạo mã bí mật</button><button class="btn sm primary" data-act="gas-copy">Sao chép mã Apps Script</button></div>
      <div class="fld"><span>Mã bí mật của bạn (dán vào biến GOOGLE_SHEET_SECRET trên Vercel)</span><div class="row"><input id="gssecret" readonly placeholder="Bấm &quot;Tạo mã bí mật&quot;" style="flex:1;min-width:200px"><button class="btn sm" data-act="gas-copy-secret">Sao chép mã bí mật</button></div></div>
      <textarea id="gscode" readonly rows="8" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78rem">${GAS}</textarea>
      <p class="muted small" style="margin:6px 0 0">Mã chỉ có thao tác THÊM dòng, không có lệnh xóa hay sửa. Chi tiết: docs/GOOGLE-SHEET.md</p></details></section>`;
}
async function sheetCall(el, path, label) {
  const out = $('#sheetout'); out.textContent = `${label}…`; el.disabled = true;
  try { const j = await api('POST', path, {}); out.innerHTML = html`<span style="color:var(--green-t)">${raw(icon('check'))} Thành công.</span>${j.sheet ? html` Google Sheet: <b>${j.sheet}</b>${j.url ? html` · <a href="${j.url}" target="_blank" rel="noopener">Mở Sheet</a>` : ''}` : ''}${j.rows !== undefined ? ` Đã thêm ${j.rows} dòng.` : ''}${j.tabs ? html`<br>Các tab: ${j.tabs.map(([n, c]) => `${n} (${c} dòng)`).join(' · ')}` : ''}`.s; }
  catch (e) { out.innerHTML = html`<span style="color:var(--red-t)">${raw(icon('alert'))} ${e.message}</span>`.s; } finally { el.disabled = false; }
}
acts['sheet-ping'] = (el) => sheetCall(el, 'sheets/ping', 'Đang kiểm tra');
acts['sheet-test'] = (el) => sheetCall(el, 'sheets/test', 'Đang gửi dòng thử');
acts['sheet-snap'] = (el) => sheetCall(el, 'sheets/snapshot', 'Đang gửi bản sao lưu đầy đủ');
acts['sheet-all'] = async (el) => { if (!confirm('Gửi TOÀN BỘ chi tiết hiện có (hóa đơn, thanh toán, khách…) vào Google Sheet? Chỉ nên làm 1 lần khi mới kết nối; làm lại sẽ thêm dòng trùng.')) return; await sheetCall(el, 'sheets/export-all', 'Đang gửi toàn bộ chi tiết'); };

const GAS_PLACEHOLDER = 'THAY-CHUOI-BI-MAT-CUA-BAN';
function gasText() { const sec = $('#gssecret')?.value; return sec ? GAS.replace(GAS_PLACEHOLDER, sec) : GAS; }
async function copyText(text, okMsg) { try { await navigator.clipboard.writeText(text); toast(okMsg); } catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); toast(okMsg); } catch { toast('Không sao chép tự động được, hãy chọn và sao chép bằng tay', 'err'); } t.remove(); } }
acts['gas-secret'] = () => { const al = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; const a = new Uint32Array(22); crypto.getRandomValues(a); const sec = 'pt70-' + [...a].map((x) => al[x % al.length]).join(''); $('#gssecret').value = sec; $('#gscode').value = gasText(); toast('Đã tạo mã bí mật và đưa vào đoạn mã Apps Script. Hãy sao chép mã Apps Script SAU bước này.'); };
acts['gas-copy'] = async () => { if (!$('#gssecret').value) { toast('Hãy bấm "Tạo mã bí mật" trước, để mã Apps Script có sẵn mã bí mật của bạn.', 'err'); return; } await copyText(gasText(), 'Đã sao chép mã Apps Script (đã kèm mã bí mật). Dán vào Apps Script.'); };
acts['gas-copy-secret'] = async () => { const v = $('#gssecret').value; if (!v) { toast('Chưa có mã bí mật', 'err'); return; } await copyText(v, 'Đã sao chép mã bí mật'); };

acts['hide-row'] = (el) => { if (!confirm('Xóa dòng này khỏi báo cáo? (Chỉ ẩn trên báo cáo; hóa đơn và tiền thu vẫn được giữ nguyên trong sổ sách. Có nút Hiện lại.)')) return; const h = hidden(); h.add(el.dataset.key); setHidden(h); loadReport(); };
acts['show-rows'] = () => { setHidden(new Set()); loadReport(); };

acts['logs-more'] = () => { logLimit += 20; rerender(); };
acts['logs-less'] = () => { logLimit = 10; rerender(); };

acts['sys-check'] = async (el) => {
  const out = $('#syscheck'); el.disabled = true; out.textContent = 'Đang kiểm tra…';
  try {
    const r = await api('POST', 'system/check', {});
    out.innerHTML = r.items.map((i) => `<div class="li"><span>${i.ok ? '✅' : '❌'} <b>${i.name}</b> <span class="muted small">${String(i.detail).replace(/[<>&]/g, '')}</span></span></div>`).join('') + `<p style="margin-top:10px;font-weight:600;color:var(${r.allOk ? '--green-t' : '--red-t'})">${r.summary}</p>`;
  } catch (e) { out.textContent = 'Không kiểm tra được: ' + e.message; } finally { el.disabled = false; }
};

// ---- Ảnh căn cước: backup .zip và khôi phục từ file backup ----
function cccdCard() {
  const n = cccdItems().length;
  return html`<section class="card" style="margin-top:12px"><h3>${icon('card', '1.2em')} Ảnh căn cước (CCCD)</h3>
    <p class="muted">Ảnh nằm trong kho Vercel Blob riêng tư, <b>không nằm trong file database.json</b>. Khi khôi phục từ file JSON, ảnh nào còn trong kho sẽ được <b>tự nối lại</b>. Nên bấm <b>Backup căn cước</b> cùng lúc với Tải database.json để có bản ảnh cất riêng.</p>
    <div class="row"><button class="btn primary" data-act="cccd-backup" ${n ? '' : 'disabled'}>${icon('photo', '1.1em')} BACKUP CĂN CƯỚC (các phòng đang ở · ${n} ảnh)</button></div>
    <p class="muted small" style="margin:8px 0 12px">Tải về 1 file .zip: mỗi phòng một thư mục, tên ảnh ghi rõ khách thuê / người ở cùng, mặt trước / mặt sau. Muốn lấy ảnh của một phòng: vào phòng đó → nút <b>Backup căn cước phòng này</b>. Giữ file ở nơi riêng tư.</p>
    <form data-form="cccd-restore"><b>Khôi phục ảnh căn cước từ file backup (.zip)</b><input type="file" name="zip" accept=".zip,application/zip" required style="margin:8px 0">
      <label class="cccd-ow"><input type="checkbox" name="overwrite"> <span>Thay cả ảnh đang có (mặc định: chỉ thêm ảnh còn thiếu)</span></label>
      <div id="cccd-res" class="calc" hidden></div><div class="err-inline"></div><button class="btn block" type="submit">${icon('rotate', '1.1em')} KHÔI PHỤC ẢNH CĂN CƯỚC</button></form></section>`;
}
acts['cccd-backup'] = async (el) => { el.disabled = true; try { await backupCccd(); } finally { el.disabled = false; } };
forms['cccd-restore'] = async (f, fd) => {
  const file = fd.get('zip'); if (!file || !file.size) throw new Error('Chưa chọn file .zip');
  const box = $('#cccd-res'); box.hidden = false; box.textContent = 'Đang đọc file và tải ảnh lên…';
  const r = await restoreCccd(file, fd.get('overwrite') === 'on', (x) => { box.textContent = `Đang tải ảnh lên… ${x.done + x.skipped + x.failed}/${x.total}`; });
  box.innerHTML = html`<b>Xong:</b> đã khôi phục <b>${r.done}</b> ảnh${r.skipped ? html`, giữ nguyên <b>${r.skipped}</b> ảnh đang có` : ''}${r.failed ? html`, <b class="owe">${r.failed}</b> ảnh lỗi (thử lại)` : ''}.${r.notFound.length ? html`<br>Không tìm thấy người trong dữ liệu hiện tại: ${r.notFound.join('; ')}` : ''}`.s;
  toast(`Đã khôi phục ${r.done} ảnh căn cước`); if (r.done) setTimeout(rerender, 2500);
};
