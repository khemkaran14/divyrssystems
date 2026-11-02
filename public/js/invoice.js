(function () {
  const cfg = window.INV;
  const form = document.getElementById('inv-form');
  const itemsEl = document.getElementById('items');
  const paper = document.getElementById('paper');
  const msg = document.getElementById('inv-msg');
  const STORE = 'divyrs_invoice_v1';
  let logo = '';
  let savedId = null;

  const today = () => new Date().toISOString().slice(0, 10);
  const plusDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const DOCS = {
    invoice: { title: 'INVOICE', num: 'Invoice', due: 'Due date', prefix: 'INV' },
    quotation: { title: 'QUOTATION', num: 'Quote', due: 'Valid until', prefix: 'QT' },
    proforma: { title: 'PROFORMA INVOICE', num: 'Proforma', due: 'Valid until', prefix: 'PI' },
    receipt: { title: 'PAYMENT RECEIPT', num: 'Receipt', due: null, prefix: 'RCT' },
  };
  const symbols = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ' };

  function blank() {
    return {
      seller: {}, client: {}, number: 'INV-' + new Date().getFullYear() + '-001', currency: 'INR',
      docType: 'invoice', date: today(), due: plusDays(15), taxMode: 'intra', payment: '', notes: 'Thank you for your business.',
      items: [{ desc: '', hsn: '', qty: 1, rate: 0, tax: 18 }], logo: '',
    };
  }

  // ---------- form <-> data ----------
  function addItemRow(it = { desc: '', hsn: '', qty: 1, rate: 0, tax: 18 }) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<div><input data-k="desc" placeholder="Item or service"><input data-k="hsn" placeholder="HSN/SAC" style="margin-top:4px"></div>' +
      '<input data-k="qty" type="number" min="0" step="any"><input data-k="rate" type="number" min="0" step="any">' +
      '<input data-k="tax" type="number" min="0" max="100" step="any"><button type="button" title="Remove">✕</button>';
    for (const k of ['desc', 'hsn', 'qty', 'rate', 'tax']) row.querySelector(`[data-k=${k}]`).value = it[k] ?? '';
    row.querySelector('button').onclick = () => { row.remove(); render(); };
    itemsEl.appendChild(row);
  }

  function read() {
    const d = { seller: {}, client: {}, items: [], logo };
    for (const el of form.elements) {
      if (!el.name) continue;
      const [a, b] = el.name.split('.');
      if (b) d[a][b] = el.value; else d[a] = el.value;
    }
    for (const row of itemsEl.children) {
      const g = (k) => row.querySelector(`[data-k=${k}]`).value;
      d.items.push({ desc: g('desc'), hsn: g('hsn'), qty: parseFloat(g('qty')) || 0, rate: parseFloat(g('rate')) || 0, tax: parseFloat(g('tax')) || 0 });
    }
    return d;
  }

  function fill(d) {
    for (const el of form.elements) {
      if (!el.name) continue;
      const [a, b] = el.name.split('.');
      const val = (b ? (d[a] || {})[b] : d[a]) ?? '';
      if (el.tagName === 'SELECT' && !val) { el.selectedIndex = 0; continue; } // older drafts lack new fields
      el.value = val;
    }
    itemsEl.innerHTML = '';
    (d.items && d.items.length ? d.items : blank().items).forEach(addItemRow);
    logo = /^data:image\/(png|jpeg);base64,/.test(d.logo || '') ? d.logo : '';
  }

  // ---------- maths ----------
  function totals(d) {
    let sub = 0, tax = 0;
    for (const it of d.items) {
      const amt = it.qty * it.rate;
      sub += amt;
      if (d.taxMode !== 'none') tax += amt * it.tax / 100;
    }
    return { sub, tax, total: sub + tax };
  }
  const money = (n, cur) => (symbols[cur] || '') + n.toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function inWordsINR(n) {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''));
    const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
    let r = Math.floor(n), p = Math.round((n - r) * 100);
    if (r === 0 && p === 0) return 'Zero Rupees Only';
    const parts = [];
    const crore = Math.floor(r / 1e7); r %= 1e7;
    const lakh = Math.floor(r / 1e5); r %= 1e5;
    const th = Math.floor(r / 1e3); r %= 1e3;
    if (crore) parts.push(three(crore) + ' Crore');
    if (lakh) parts.push(two(lakh) + ' Lakh');
    if (th) parts.push(two(th) + ' Thousand');
    if (r) parts.push(three(r));
    return (parts.join(' ') || 'Zero') + ' Rupees' + (p ? ' and ' + two(p) + ' Paise' : '') + ' Only';
  }

  // ---------- preview (built with textContent: no HTML injection) ----------
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style') el.style.cssText = v; else if (k === 'class') el.className = v; else el.setAttribute(k, v);
    }
    for (const c of kids) if (c != null) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const lines = (text) => { const s = h('div', { style: 'white-space:pre-line' }); s.textContent = text || ''; return s; };

  function render() {
    const d = read();
    const t = totals(d);
    const c = d.currency;
    paper.innerHTML = '';

    const left = h('div', {},
      logo ? h('img', { src: logo, class: 'logo-img', alt: '' }) : null,
      h('div', { style: 'font-weight:700;font-size:16px;margin-top:6px' }, d.seller.name || 'Your Business Name'),
      lines(d.seller.address),
      d.seller.gstin ? h('div', {}, 'GSTIN: ' + d.seller.gstin) : null,
      d.seller.contact ? h('div', {}, d.seller.contact) : null);
    const kind = DOCS[d.docType] || DOCS.invoice;
    const title = d.docType === 'invoice' || !d.docType ? (d.taxMode === 'none' ? 'INVOICE' : 'TAX INVOICE') : kind.title;
    document.getElementById('due-label').textContent = kind.due || 'Due date';
    const right = h('div', { style: 'text-align:right' },
      h('div', { class: 'inv-title' }, title),
      h('div', {}, kind.num + ' #: ' + (d.number || '')),
      h('div', {}, 'Date: ' + (d.date || '')),
      d.due && kind.due ? h('div', {}, kind.due + ': ' + d.due) : null);
    paper.append(h('div', { class: 'inv-head' }, left, right));

    paper.append(h('div', { style: 'margin-bottom:20px' },
      h('div', { style: 'color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.05em' }, d.docType === 'quotation' ? 'Quotation for' : d.docType === 'receipt' ? 'Received from' : 'Bill to'),
      h('div', { style: 'font-weight:700' }, d.client.name || 'Client name'),
      lines(d.client.address),
      d.client.gstin ? h('div', {}, 'GSTIN: ' + d.client.gstin) : null));

    const showTax = d.taxMode !== 'none';
    const head = h('tr', {}, h('th', {}, '#'), h('th', {}, 'Item'), h('th', {}, 'HSN/SAC'), h('th', { class: 'num' }, 'Qty'),
      h('th', { class: 'num' }, 'Rate'), showTax ? h('th', { class: 'num' }, 'GST') : null, h('th', { class: 'num' }, 'Amount'));
    const body = h('tbody');
    d.items.forEach((it, i) => body.append(h('tr', {},
      h('td', {}, i + 1), h('td', {}, it.desc), h('td', {}, it.hsn), h('td', { class: 'num' }, it.qty),
      h('td', { class: 'num' }, money(it.rate, c)), showTax ? h('td', { class: 'num' }, it.tax + '%') : null,
      h('td', { class: 'num' }, money(it.qty * it.rate, c)))));
    paper.append(h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, head), body)));

    const tot = h('div', { class: 'totals' }, h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, money(t.sub, c))));
    if (d.taxMode === 'intra') {
      tot.append(h('div', {}, h('span', {}, 'CGST'), h('span', {}, money(t.tax / 2, c))));
      tot.append(h('div', {}, h('span', {}, 'SGST'), h('span', {}, money(t.tax / 2, c))));
    } else if (d.taxMode === 'inter') {
      tot.append(h('div', {}, h('span', {}, 'IGST'), h('span', {}, money(t.tax, c))));
    }
    tot.append(h('div', { class: 'grand' }, h('span', {}, d.docType === 'receipt' ? 'Amount received' : 'Total'), h('span', {}, money(t.total, c))));
    paper.append(tot);
    if (c === 'INR') paper.append(h('div', { style: 'margin-top:8px;font-style:italic;text-align:right' }, inWordsINR(t.total)));

    if (d.payment) paper.append(h('div', { style: 'margin-top:28px' }, h('strong', {}, 'Payment details'), lines(d.payment)));
    if (d.notes) paper.append(h('div', { style: 'margin-top:16px' }, h('strong', {}, 'Notes'), lines(d.notes)));
    if (cfg.watermark) paper.append(h('div', { class: 'wm' }, 'Made with Divyrs free invoice maker · ' + cfg.siteUrl));

    try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (_) { /* storage may be blocked */ }
    return { d, t };
  }

  function flash(text, kind) {
    msg.innerHTML = '';
    const el = h('div', { class: 'alert ' + kind }, text);
    msg.append(el);
  }

  // ---------- events ----------
  form.addEventListener('input', render);
  document.getElementById('add-item').onclick = () => { addItemRow(); render(); };
  document.getElementById('print').onclick = () => { render(); window.print(); };
  document.getElementById('new').onclick = () => {
    const keep = read().seller;
    const b = blank(); b.seller = keep; b.logo = logo;
    b.docType = read().docType;
    b.number = (DOCS[b.docType] || DOCS.invoice).prefix + '-' + new Date().getFullYear() + '-001';
    savedId = null; fill(b); render();
  };
  document.getElementById('logo-file').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 100 * 1024) { flash('Logo must be under 100 KB.', 'error'); return; }
    const r = new FileReader();
    r.onload = () => { logo = r.result; render(); };
    r.readAsDataURL(f);
  };
  document.getElementById('save').onclick = async () => {
    if (!cfg.loggedIn) { location.href = '/signup?next=/tools/invoice'; return; }
    const { d, t } = render();
    try {
      const res = await fetch('/dashboard/invoices/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...d, id: savedId, total: t.total }),
      });
      const out = await res.json();
      if (out.ok) { savedId = out.id; flash('Saved. Find it under Dashboard → Invoices.', 'success'); }
      else flash(out.error || 'Could not save.', 'error');
    } catch (_) { flash('Could not save. Check your connection.', 'error'); }
  };

  // ---------- start ----------
  let start = blank();
  if (cfg.saved) { start = cfg.saved; savedId = cfg.saved.id; }
  else {
    try { const s = JSON.parse(localStorage.getItem(STORE)); if (s) start = s; } catch (_) { /* ignore */ }
  }
  fill(start);
  render();
})();
