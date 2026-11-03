// Rule-based understanding of regulator documents. Works with no AI key and
// also double-checks AI output.

const ENTITY_TYPES = ['bank', 'cooperative_bank', 'nbfc', 'hfc', 'payment_company', 'insurer', 'broker',
  'listed_company', 'company', 'individual', 'intermediary', 'other'];
const ACTION_TYPES = ['monetary_penalty', 'settlement', 'debarment', 'licence_cancellation', 'restrictions',
  'order', 'warning', 'other'];
const DOC_TYPES = ['circular', 'notification', 'master_direction', 'press_release', 'order', 'consultation', 'other'];

const decodeEntities = (s) => String(s || '')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const clean = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- classification
function classify({ regulator, title, url }) {
  const t = clean(title).toLowerCase();
  const u = String(url || '').toLowerCase();
  let docType = 'other';
  if (/master direction|master circular/.test(t)) docType = 'master_direction';
  else if (/consultation|draft|comments? (are )?(invited|sought)/.test(t)) docType = 'consultation';
  else if (/\border\b|adjudicat|settlement/.test(t) || u.includes('/enforcement/')) docType = 'order';
  else if (u.includes('/circulars/') || /\bcircular\b/.test(t)) docType = 'circular';
  else if (u.includes('notification') || /notification/.test(t)) docType = 'notification';
  else if (u.includes('pressrelease') || u.includes('press-releases')) docType = 'press_release';

  const enforcement =
    /(imposes|imposed) (a )?monetary penalty|penalty (on|imposed)|cancels? (the )?(certificate of registration|licence|license)|directions under section 35a|imposes (business )?restrictions|supersedes the board/.test(t) ||
    (regulator === 'SEBI' && (u.includes('/enforcement/') || /(adjudication|settlement|final|interim|confirmatory) order|order in (the matter|respect) of/.test(t)));

  return { docType: enforcement && docType === 'press_release' ? 'press_release' : docType, isEnforcement: !!enforcement };
}

// ---------------------------------------------------------------- amounts
// "₹5,00,000", "Rs. 2.50 lakh", "₹1.2 crore", "INR 10 lakh" → rupees
function parseAmountInr(text) {
  const s = clean(text).replace(/,/g, '');
  const re = /(?:₹|rs\.?|inr)\s*([0-9]+(?:\.[0-9]+)?)\s*(crore|cr\.?|lakh|lac|lakhs|million|mn)?/gi;
  let best = null;
  let m;
  while ((m = re.exec(s))) {
    let v = parseFloat(m[1]);
    const unit = (m[2] || '').toLowerCase();
    if (unit.startsWith('cr')) v *= 1e7;
    else if (unit.startsWith('la')) v *= 1e5;
    else if (unit === 'million' || unit === 'mn') v *= 1e6;
    if (v > 0 && (best === null || v > best)) best = v;
  }
  return best === null ? null : Math.round(best);
}

// ---------------------------------------------------------------- entities
const SUFFIXES = [
  'private limited', 'pvt ltd', 'pvt limited', 'private ltd', 'limited', 'ltd', 'llp', 'plc', 'inc',
  'co operative', 'cooperative', 'co op', 'sahakari', 'the', 'm s', 'mr', 'ms', 'mrs', 'shri', 'smt', 'dr',
];
const SUFFIX_RE = new RegExp(`\\b(${SUFFIXES.map((s) => s.replace(/ /g, '\\s+')).join('|')})\\b`, 'g');

function normalizeName(name) {
  return clean(name).toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(SUFFIX_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s) {
  const t = ` ${s} `;
  const out = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

// Dice similarity on character bigrams (0..1), robust to small spelling differences.
function nameSimilarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x);
  const B = bigrams(y);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of A) { total += n; overlap += Math.min(n, B.get(g) || 0); }
  for (const n of B.values()) total += n;
  let score = (2 * overlap) / total;
  // Every query word present in the name is a strong signal.
  const qWords = x.split(' ');
  const nWords = new Set(y.split(' '));
  if (qWords.every((w) => nWords.has(w))) score = Math.max(score, 0.85 + 0.15 * (qWords.length / nWords.size));
  return Math.min(1, score);
}

function guessEntityType(name) {
  const n = name.toLowerCase();
  if (/co-?operative bank|sahakari bank|urban bank|district central/.test(n)) return 'cooperative_bank';
  if (/\bbank\b/.test(n)) return 'bank';
  if (/housing finance/.test(n)) return 'hfc';
  if (/insurance|assurance/.test(n)) return 'insurer';
  if (/payments?\b|wallet|pay\b/.test(n)) return 'payment_company';
  if (/finance|financial|capital|credit|fincorp|leasing|investments?/.test(n)) return 'nbfc';
  if (/securities|broking|stock|share/.test(n)) return 'broker';
  if (/\b(ltd|limited|llp|pvt)\b/.test(n)) return 'company';
  if (/^(mr|ms|mrs|shri|smt|dr)\.?\s/i.test(name)) return 'individual';
  return 'other';
}

const splitNames = (s) => s
  .split(/\s*(?:,|;|\band\b|&)\s*(?=(?:m\/s\.?|mr\.?|ms\.?|mrs\.?|shri|smt\.?|the\b|[A-Z]))/)
  .map((x) => x.replace(/^(and|&)\s+/i, '').trim())
  .filter((x) => x.length > 2 && !/^(others?|ors\.?)$/i.test(x));

// Best-effort entities + action from a title (AI does this better when available).
function actionsFromTitle({ regulator, title, text }) {
  const t = clean(title);
  const low = t.toLowerCase();
  let actionType = 'other';
  if (/monetary penalty|penalty/.test(low)) actionType = 'monetary_penalty';
  else if (/settlement/.test(low)) actionType = 'settlement';
  else if (/cancel/.test(low)) actionType = 'licence_cancellation';
  else if (/restriction|section 35a/.test(low)) actionType = 'restrictions';
  else if (/debar|restrain|prohibit/.test(low)) actionType = 'debarment';
  else if (/adjudicat/.test(low) && parseAmountInr(text)) actionType = 'monetary_penalty';
  else if (/order/.test(low)) actionType = 'order';

  let names = [];
  let m;
  if ((m = t.match(/penalty on\s+(.+)$/i)) || (m = t.match(/(?:licence|license|registration) of\s+(.+)$/i)) ||
      (m = t.match(/restrictions on\s+(.+)$/i))) {
    // RBI style: "... on The Abc Co-operative Bank Ltd., Pune, Maharashtra"
    // Keep everything up to "Ltd."/"Limited"/"LLP"; otherwise stop at the first comma (city follows).
    let n = m[1];
    const ltd = n.match(/^(.*?\b(?:ltd|limited|llp)\b\.?)/i);
    n = ltd ? ltd[1] : n.split(',')[0];
    names = [n];
  } else if ((m = t.match(/in respect of\s+(.+?)(?:\s+in the matter of\b.*)?$/i))) {
    names = splitNames(m[1]);
  } else if ((m = t.match(/in the matter of\s+(.+)$/i))) {
    names = [m[1]];
  }

  const amount = actionType === 'monetary_penalty' || actionType === 'settlement' ? parseAmountInr(`${t} ${text || ''}`) : null;
  return names
    .map((n) => n.replace(/[.,;:\s]+$/, '').trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((name) => ({ entity_name: name, entity_type: guessEntityType(name), action_type: actionType, amount_inr: amount, reason: null }));
}

module.exports = {
  ENTITY_TYPES, ACTION_TYPES, DOC_TYPES,
  clean, classify, parseAmountInr, normalizeName, nameSimilarity, guessEntityType, actionsFromTitle,
};
