// GST for Divyrs' own sales (subscriptions). Charged on INR sales only when GSTIN is set.
const config = require('./config');

const STATES = {
  AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar',
  CH: 'Chandigarh', CG: 'Chhattisgarh', DN: 'Dadra and Nagar Haveli and Daman and Diu', DL: 'Delhi', GA: 'Goa',
  GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh', JK: 'Jammu and Kashmir', JH: 'Jharkhand', KA: 'Karnataka',
  KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep', MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur',
  ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland', OD: 'Odisha', PY: 'Puducherry', PB: 'Punjab', RJ: 'Rajasthan',
  SK: 'Sikkim', TN: 'Tamil Nadu', TS: 'Telangana', TR: 'Tripura', UP: 'Uttar Pradesh', UK: 'Uttarakhand', WB: 'West Bengal',
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Returns { base, tax, total, rate, mode: 'intra' | 'inter' | 'export' | 'none' }
function taxFor(base, currency, buyerState) {
  const rate = config.business.gstRate;
  if (currency !== 'INR') return { base, tax: 0, total: base, rate: 0, mode: rate ? 'export' : 'none' };
  if (!rate) return { base, tax: 0, total: base, rate: 0, mode: 'none' };
  const tax = Math.round((base * rate) / 100);
  const intra = !!config.business.state && buyerState === config.business.state;
  return { base, tax, total: base + tax, rate, mode: intra ? 'intra' : 'inter' };
}

// Indian financial year label for a timestamp: April–March, e.g. "2026-27".
function financialYear(ms) {
  const d = new Date(ms);
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

function nextInvoiceNo(db, paidAt) {
  const fy = financialYear(paidAt);
  const prefix = `DIV/${fy}/`;
  const row = db.prepare("SELECT invoice_no FROM payments WHERE invoice_no LIKE ? ORDER BY invoice_no DESC LIMIT 1").get(prefix + '%');
  const n = row ? parseInt(row.invoice_no.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(n).padStart(4, '0');
}

module.exports = { STATES, GSTIN_RE, taxFor, financialYear, nextInvoiceNo };
