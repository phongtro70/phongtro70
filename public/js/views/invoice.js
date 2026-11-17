import { html, raw, vnd, num, dmy, field, openModal, closeModal, toInt, toDec, todayLocal, INV_STATUS, INV_COLOR } from '../util.js';
import { D, DV, S, save, invD, latestInvOf, room } from '../api.js';
import { acts, forms, rerender, go } from '../ui.js';
import { payDialog } from './room.js';
import { billArticle } from './bill.js';
import { billModel, saveBill } from '../invoice-img.js';
import { icon } from '../icons.js';
import { toast } from '../util.js';

export function invoiceView(id) {
  const i = D().invoices.find((x) => x.id === id); if (!i) return html`<p>Không tìm thấy hóa đơn. <a href="#/dashboard">Về tổng quan</a></p>`;
  const x = invD(i.id); const isLatest = latestInvOf(i.chainId).id === i.id && !i.rolledOver;
  const pays = D().payments.filter((p) => p.invoiceId === i.id);
  const co = D().checkoutRecords.find((c) => c.invoiceId === i.id);
  const m = billModel(i, x, S.snap.settings?.bank, S.snap.settings?.bankQr);
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;
  return html`<div class="row noprint" style="margin-bottom:12px"><a class="back sp" href="#/room/${i.roomId}">← ${i.roomName}</a></div>
  ${billArticle(i, x, 'bill')}
  ${isLatest && x.remaining > 0 ? html`<div class="row noprint" style="justify-content:center;margin:14px 0 0"><button class="btn green big" data-act="pay" data-id="${i.id}">${icon('check', '1.2em')} Đã nhận tiền (còn ${vnd(x.remaining)})</button></div>` : ''}<div class="row noprint" style="justify-content:center;margin:14px 0"><button class="btn primary" data-act="bill-jpg">${raw(icon('photo', '1.15em'))} Tải hóa đơn (ảnh JPG)</button>${canShare ? html`<button class="btn" data-act="bill-share">Gửi Zalo / Chia sẻ</button>` : ''}<button class="btn" data-act="print">In</button>${isLatest && i.kind === 'periodic' ? html`<button class="btn" data-act="adjust" data-id="${i.id}">Điều chỉnh</button>` : ''}${isLatest && i.kind === 'periodic' ? html`<button class="btn red" data-act="edit-charges" data-id="${i.id}">${icon('edit', '1.1em')} Sửa nợ cũ / tiền thu thêm</button>` : ''}</div>
  <p class="muted small noprint" style="text-align:center;margin:0 0 16px">Bấm "Tải hóa đơn" để lưu ảnh JPG vào điện thoại rồi gửi Zalo cho khách. Trên điện thoại, "Gửi Zalo / Chia sẻ" mở sẵn danh sách ứng dụng để chọn Zalo.</p>
  <section class="card noprint" style="max-width:640px;margin:0 auto">
    ${pays.length ? html`<h3>Lịch sử thanh toán</h3><div class="list" style="margin:8px 0 12px">${pays.map((p) => html`<div class="li"><span>${dmy(p.date)} ${p.note ? `· ${p.note}` : ''}${p.voided ? html` <span class="badge red">Đã hủy: ${p.voidReason}</span>` : ''}</span><span style="${p.voided ? 'text-decoration:line-through' : ''}">${vnd(p.amount)} ${isLatest && !p.voided ? html`<button class="btn sm" data-act="void-pay" data-id="${p.id}">Hủy</button>` : ''}</span></div>`)}</div>` : html`<p class="muted small" style="margin:0 0 8px">Chưa có giao dịch thanh toán.</p>`}
    ${chargeHistoryHtml([i])}
    ${i.adjustments.length ? html`<h3>Lịch sử điều chỉnh</h3>${i.adjustments.map((a) => html`<p class="small muted">${a.at.slice(0, 16).replace('T', ' ')} · ${a.reason} · tổng ${vnd(a.before.total)} → ${vnd(a.after.total)}</p>`)}` : ''}
    <p class="small muted" style="margin:0">Mã hóa đơn: ${i.code} · lập ngày ${dmy(i.issuedDate)} · khách: ${i.tenantName}</p>
    ${co ? html`<p class="small muted">Quyết toán: ${co.days} ngày thực tế × ${vnd(co.rentPerDay)}/ngày = ${vnd(co.actualRent)}. ${co.refund ? `Hoàn tiền: ${co.refund.status === 'done' ? 'đã hoàn ' + dmy(co.refund.date) : 'CHƯA hoàn'}.` : ''}</p>` : ''}
    ${co?.refund?.status === 'pending' ? html`<button class="btn primary block" data-act="refunded" data-id="${co.id}">Xác nhận ĐÃ HOÀN ${vnd(co.refund.amount)} cho khách</button>` : ''}</section>`;
}
acts['bill-jpg'] = async (el) => { const i = currentInvoice(); el.disabled = true; try { const r = await saveBill(billModel(i, invD(i.id), S.snap.settings?.bank, S.snap.settings?.bankQr)); if (r === 'downloaded') toast('Đã tải ảnh hóa đơn (xem trong mục Tải xuống / Ảnh)'); } finally { el.disabled = false; } };
acts['bill-share'] = async (el) => { const i = currentInvoice(); el.disabled = true; try { await saveBill(billModel(i, invD(i.id), S.snap.settings?.bank, S.snap.settings?.bankQr), { share: true }); } finally { el.disabled = false; } };
const currentInvoice = () => D().invoices.find((x) => x.id === location.hash.split('/')[2]);
acts.print = () => window.print();
acts['void-pay'] = (el) => openModal('Hủy giao dịch thanh toán', html`<form data-form="void-pay" data-id="${el.dataset.id}"><p class="warn-box">Giao dịch không bị xóa, chỉ đánh dấu "Đã hủy" kèm lý do.</p>${field('Lý do hủy *', html`<input name="reason" required maxlength="200">`)}<div class="err-inline"></div><button class="btn danger block" type="submit">HỦY GIAO DỊCH</button></form>`);
forms['void-pay'] = async (f, fd) => { await save('POST', `payments/${f.dataset.id}/void`, { reason: fd.get('reason') }, 'Đã hủy giao dịch'); closeModal(); rerender(); };
acts.adjust = (el) => {
  const i = D().invoices.find((x) => x.id === el.dataset.id); const e0 = i.extras[0];
  openModal(`Điều chỉnh ${i.code}`, html`<form data-form="adjust" data-id="${i.id}"><p class="warn-box">Chỉ điều chỉnh được hóa đơn mới nhất của khách. Mọi thay đổi được lưu lịch sử kèm lý do.</p>
    ${i.elec ? html`<div class="two">${field(`Chỉ số điện mới (cũ ${i.elec.old})`, html`<input name="elecNew" inputmode="decimal" value="${i.elec.new}">`)}${field(`Chỉ số nước mới (cũ ${i.water.old})`, html`<input name="waterNew" inputmode="decimal" value="${i.water.new}">`)}</div>` : ''}
    <div class="two">${field('Tiền thu thêm – ghi chú (thu tiền gì)', html`<input name="x1l" value="${e0?.label || ''}">`)}${field('Số tiền thu thêm (đ)', html`<input name="x1a" inputmode="numeric" value="${e0?.amount || ''}">`)}</div>
    ${i.extras.length > 1 ? html`<p class="muted small">Các khoản thu thêm khác giữ nguyên: ${i.extras.slice(1).map((e) => `${e.label} ${vnd(e.amount)}`).join('; ')}.</p>` : ''}
    ${i.manualDebt > 0 ? field(`Lý do nợ cũ (khoản nợ cũ nhập thêm ${vnd(i.manualDebt)})`, html`<input name="manualDebtNote" maxlength="200" value="${i.manualDebtNote || ''}" placeholder="Ví dụ: còn thiếu tiền phòng tháng 10">`) : ''}
    ${field('Lý do điều chỉnh *', html`<input name="reason" required maxlength="200">`)}<div class="err-inline"></div><button class="btn primary block" type="submit">LƯU ĐIỀU CHỈNH</button></form>`);
};
forms.adjust = async (f, fd) => {
  const i = D().invoices.find((y) => y.id === f.dataset.id); const x = fd.get('x1l').trim(); const xa = toInt(fd.get('x1a'));
  if (xa && !x) throw new Error('Có nhập số tiền thu thêm thì hãy ghi chú thu tiền gì.');
  const body = { reason: fd.get('reason'), extras: [...(x || fd.get('x1a') ? [{ label: x, amount: xa }] : []), ...((i?.extras || []).slice(1))] }; // giữ nguyên các khoản thu thêm khác
  if (f.manualDebtNote) body.manualDebtNote = String(fd.get('manualDebtNote') || '').trim();
  if (f.elecNew) { body.elecNew = toDec(fd.get('elecNew')); body.waterNew = toDec(fd.get('waterNew')); }
  await save('PUT', `invoices/${f.dataset.id}`, body, 'Đã điều chỉnh'); closeModal(); rerender();
};

// ---- Sửa NỢ CŨ + TIỀN THU THÊM (số tiền + ghi chú), có lưu lịch sử ----
const xRow = (e = {}) => html`<div class="cx-row two keep">${field('Tiền thu thêm (đ)', html`<input name="cx_amount" inputmode="numeric" value="${e.amount || ''}" placeholder="0">`)}<div class="cx-l">${field('Ghi chú thu thêm', html`<input name="cx_label" maxlength="100" value="${e.label && e.label !== 'Chi phí khác' ? e.label : ''}" placeholder="Ví dụ: sửa khóa, internet…">`)}<button type="button" class="btn sm danger" data-act="cx-del">${icon('trash', '1em')} Xóa khoản này</button></div></div>`;
acts['edit-charges'] = (el) => {
  const i = D().invoices.find((x) => x.id === el.dataset.id); if (!i) return;
  if (latestInvOf(i.chainId).id !== i.id || i.rolledOver || i.kind !== 'periodic') { openModal('Không sửa được hóa đơn này', html`<p style="margin-top:0">Hóa đơn này đã chốt (nợ đã chuyển sang hóa đơn mới hơn). Hãy mở <b>hóa đơn mới nhất</b> của khách để sửa nợ cũ / tiền thu thêm.</p><button class="btn block" data-act="modal-close">Đã hiểu</button>`); return; }
  openModal(`Sửa nợ cũ & tiền thu thêm – ${i.roomName}`, html`<form data-form="charges" data-id="${i.id}">
    <p class="muted small" style="margin-top:0">Hóa đơn ${i.code} · tháng ${Number(i.dueDate.slice(5, 7))}/${i.dueDate.slice(0, 4)}. Mọi lần sửa đều được lưu lịch sử (trước → sau, lý do, thời gian).</p>
    <fieldset><legend>Nợ cũ nhập thêm</legend><div class="two keep">${field('Tiền nợ cũ (đ)', html`<input name="manualDebt" inputmode="numeric" value="${i.manualDebt || 0}">`, 'Để 0 nếu không còn nợ cũ')}${field('Ghi chú nợ cũ', html`<input name="manualDebtNote" maxlength="200" value="${i.manualDebtNote || ''}" placeholder="Ví dụ: Nợ tiền T9, T10, T11">`)}</div>
      ${i.oldDebt ? html`<p class="muted small" style="margin:0 0 8px">Ngoài ra còn ${vnd(i.oldDebt)} nợ các tháng trước (tự cộng dồn, không sửa ở đây).</p>` : ''}</fieldset>
    <fieldset><legend>Tiền thu thêm</legend><div id="cx-list">${(i.extras || []).map(xRow)}</div><button type="button" class="btn sm red" data-act="cx-add" style="margin-bottom:10px">${icon('plus', '1em')} Thêm khoản thu thêm</button></fieldset>
    ${field('Lý do sửa *', html`<input name="reason" required maxlength="200" placeholder="Ví dụ: khách báo đã trả bớt tháng 9">`)}
    <div class="err-inline"></div><button class="btn primary block" type="submit">LƯU THAY ĐỔI</button></form>`, { wide: true });
};
acts['cx-add'] = () => { const d = document.createElement('div'); d.innerHTML = xRow().s; document.getElementById('cx-list').append(d.firstElementChild); };
acts['cx-del'] = (el) => el.closest('.cx-row').remove();
forms.charges = async (f, fd) => {
  const amounts = fd.getAll('cx_amount'), labels = fd.getAll('cx_label');
  const extras = amounts.map((a, k) => ({ amount: toInt(a), label: String(labels[k] || '').trim() })).filter((e) => e.amount || e.label);
  if (extras.some((e) => !Number.isInteger(e.amount) || !e.amount)) throw new Error('Khoản thu thêm phải có số tiền (khác 0)');
  if (extras.some((e) => !e.label)) throw new Error('Mỗi khoản thu thêm phải có ghi chú (thu tiền gì)');
  const md = toInt(fd.get('manualDebt')) || 0; const note = String(fd.get('manualDebtNote') || '').trim();
  if (md > 0 && !note) throw new Error('Có tiền nợ cũ thì hãy ghi chú lý do nợ');
  await save('PUT', `invoices/${f.dataset.id}/charges`, { manualDebt: md, manualDebtNote: note, extras, reason: fd.get('reason') }, 'Đã lưu – có ghi lịch sử sửa'); closeModal(); rerender();
};
// Lịch sử sửa nợ cũ / tiền thu thêm (dùng ở trang hóa đơn và trang phòng)
const xs = (list) => (list.length ? list.map((e) => `${e.label} ${vnd(e.amount)}`).join('; ') : 'không có');
export function chargeHistoryHtml(invs) {
  const rows = invs.flatMap((i) => (i.chargeHistory || []).map((h) => ({ i, h }))).sort((a, b) => b.h.at.localeCompare(a.h.at));
  if (!rows.length) return '';
  return html`<h3 style="margin-top:12px">Lịch sử sửa nợ cũ & tiền thu thêm</h3><div class="list chist">${rows.map(({ i, h }) => html`<div class="li"><div style="width:100%">
    <b>${h.at.slice(0, 16).replace('T', ' ')}</b> · ${i.code} (tháng ${Number(i.dueDate.slice(5, 7))}/${i.dueDate.slice(0, 4)}) · Lý do: <b>${h.reason}</b>
    ${h.before.manualDebt !== h.after.manualDebt || h.before.manualDebtNote !== h.after.manualDebtNote ? html`<div class="small">Nợ cũ: ${vnd(h.before.manualDebt)}${h.before.manualDebtNote ? ` (${h.before.manualDebtNote})` : ''} → <b>${vnd(h.after.manualDebt)}${h.after.manualDebtNote ? ` (${h.after.manualDebtNote})` : ''}</b></div>` : ''}
    ${JSON.stringify(h.before.extras) !== JSON.stringify(h.after.extras) ? html`<div class="small">Thu thêm: ${xs(h.before.extras)} → <b>${xs(h.after.extras)}</b></div>` : ''}
    <div class="small muted">Tổng hóa đơn: ${vnd(h.before.total)} → ${vnd(h.after.total)}</div></div></div>`)}</div>`;
}
