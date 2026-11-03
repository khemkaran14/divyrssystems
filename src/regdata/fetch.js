// Fetching feeds, pages and PDFs from regulator websites, politely.
const { XMLParser } = require('fast-xml-parser');
const { clean } = require('./rules');
const { hostAllowed } = require('./sources');

const UA = 'DivyrsRegData/1.0 (+https://divyrs.com/regdata)';
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

async function get(url, { timeout = 30000, maxBytes = MAX_PAGE_BYTES } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) throw new Error(`Too large (${len} bytes): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`Too large (${buf.length} bytes): ${url}`);
  return { buf, type: (res.headers.get('content-type') || '').toLowerCase(), finalUrl: res.url || url };
}

// ---------------------------------------------------------------- RSS
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', trimValues: true });
const text = (v) => (v == null ? '' : typeof v === 'object' ? (v['#text'] ?? '') : String(v));

function parseDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  // "02/11/2026" or "02-11-2026" (day first, as Indian sites use)
  const m = String(s).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function parseFeed(xml) {
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel || doc?.['rdf:RDF'] || doc?.feed;
  if (!channel) throw new Error('Not an RSS/Atom feed');
  let items = channel.item || channel.entry || doc?.['rdf:RDF']?.item || [];
  if (!Array.isArray(items)) items = [items];
  return items.map((it) => {
    let link = text(it.link);
    if (!link && it.link && it.link['@href']) link = it.link['@href'];
    if (Array.isArray(it.link)) link = it.link[0]['@href'] || text(it.link[0]);
    link = link.trim();
    const title = clean(text(it.title));
    const guid = text(it.guid) || link || title;
    const published = parseDate(text(it.pubDate) || text(it.published) || text(it.updated) || text(it['dc:date']));
    return { title, link, guid: guid.trim(), description: clean(text(it.description) || text(it.summary)), published };
  }).filter((x) => x.title && x.link);
}

// ---------------------------------------------------------------- pages
function htmlToText(html) {
  return clean(String(html)
    .replace(/<(script|style|noscript|nav|header|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n'))
    .slice(0, 200000);
}

function findPdfLinks(html, baseUrl) {
  const out = new Set();
  const re = /(?:href|src)\s*=\s*["']([^"']+?\.pdf)(?:[?#][^"']*)?["']|(https?:\/\/[^\s"'<>]+?\.pdf)\b/gi;
  let m;
  while ((m = re.exec(html))) {
    let u = m[1] || m[2];
    // SEBI embeds "web/?file=https://.../x.pdf"
    const inner = u.match(/file=(https?:\/\/.+\.pdf)/i);
    if (inner) u = inner[1];
    try { out.add(new URL(u, baseUrl).href); } catch (_) { /* skip */ }
  }
  return [...out];
}

// Loads a document: returns { text, pdf (Buffer|null), pdfUrl }.
async function loadDocument(source, url) {
  if (source && !hostAllowed(source, url)) throw new Error(`Host not allowed for ${source.id}: ${url}`);
  const page = await get(url, { maxBytes: MAX_PDF_BYTES });
  if (page.type.includes('pdf') || /\.pdf($|\?)/i.test(url)) {
    return { text: '', pdf: page.buf, pdfUrl: page.finalUrl };
  }
  const html = page.buf.toString('utf8');
  const textContent = htmlToText(html);
  const pdfUrl = findPdfLinks(html, page.finalUrl).find((u) => !source || hostAllowed(source, u)) || null;
  let pdf = null;
  if (pdfUrl) {
    try {
      const p = await get(pdfUrl, { maxBytes: MAX_PDF_BYTES, timeout: 60000 });
      if (p.buf.subarray(0, 5).toString() === '%PDF-') pdf = p.buf;
    } catch (e) {
      console.warn('[regdata] PDF download failed:', e.message);
    }
  }
  return { text: textContent, pdf, pdfUrl };
}

module.exports = { get, parseFeed, parseDate, htmlToText, findPdfLinks, loadDocument, UA };
