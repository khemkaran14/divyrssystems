// Collect new items from feeds, then read + extract each one.
const { SOURCES } = require('./sources');
const fetcher = require('./fetch');
const rules = require('./rules');
const ai = require('./extract');
const store = require('./store');
const webhooks = require('./webhooks');

const db = store.db;
const MAX_AI_PER_DAY = Number(process.env.REGDATA_MAX_AI_PER_DAY || 300);
const isoDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

// ---------------------------------------------------------------- collect
async function collectSource(source, { xml } = {}) {
  db.prepare('INSERT OR IGNORE INTO reg_sources (id, regulator, name, url) VALUES (?,?,?,?)').run(source.id, source.regulator, source.name, source.url);
  try {
    const body = xml ?? (await fetcher.get(source.url, { timeout: 30000 })).buf.toString('utf8');
    const items = fetcher.parseFeed(body);
    let added = 0;
    for (const it of items) {
      if (!/^https?:\/\//i.test(it.link)) continue;
      const c = rules.classify({ regulator: source.regulator, title: it.title, url: it.link });
      const id = store.addDocument({
        source_id: source.id, regulator: source.regulator, guid: it.guid, url: it.link, title: it.title.slice(0, 500),
        published_at: it.published || Date.now(), doc_type: c.docType, is_enforcement: c.isEnforcement ? 1 : 0,
      });
      if (id) {
        added++;
        if (it.description) db.prepare('UPDATE reg_documents SET summary = ? WHERE id = ?').run(it.description.slice(0, 2000), id);
      }
    }
    db.prepare("UPDATE reg_sources SET last_fetched=?, last_status='ok', last_error=NULL, items_seen=items_seen+? WHERE id=?").run(Date.now(), added, source.id);
    return { source: source.id, items: items.length, added };
  } catch (e) {
    db.prepare("UPDATE reg_sources SET last_fetched=?, last_status='error', last_error=? WHERE id=?").run(Date.now(), e.message.slice(0, 300), source.id);
    return { source: source.id, error: e.message };
  }
}

async function collectAll() {
  const out = [];
  for (const s of SOURCES) out.push(await collectSource(s)); // one at a time, to be polite
  return out;
}

// ---------------------------------------------------------------- process
function aiBudgetLeft() {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare('SELECT runs FROM reg_ai_log WHERE day = ?').get(today);
  return MAX_AI_PER_DAY - (row ? row.runs : 0);
}
function logAi(usage) {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO reg_ai_log (day, runs, input_tokens, output_tokens) VALUES (?, 1, ?, ?)
    ON CONFLICT(day) DO UPDATE SET runs = runs + 1, input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens`)
    .run(today, usage.input_tokens || 0, usage.output_tokens || 0);
}

function rulesResult(doc, loaded) {
  const c = rules.classify(doc);
  const text = loaded ? loaded.text : '';
  const actions = c.isEnforcement ? rules.actionsFromTitle({ regulator: doc.regulator, title: doc.title, text }) : [];
  const day = new Date(doc.published_at).toISOString().slice(0, 10);
  let summary = doc.summary;
  if (!summary && text) summary = text.slice(0, 600);
  return {
    doc_type: c.docType, ref_no: null, summary: summary || null, impact: null, effective_date: null,
    applies_to: [], topics: [], obligations: [], deadlines: [], amends: [],
    enforcement_actions: actions.map((a) => ({ ...a, action_date: day })),
    pdf_url: loaded ? loaded.pdfUrl : null, extraction: 'rules',
  };
}

function cleanAi(data, doc, loaded) {
  const pub = new Date(doc.published_at).toISOString().slice(0, 10);
  const r = {
    doc_type: rules.DOC_TYPES.includes(data.doc_type) ? data.doc_type : 'other',
    ref_no: data.ref_no ? String(data.ref_no).slice(0, 200) : null,
    summary: data.summary ? String(data.summary).slice(0, 3000) : null,
    impact: ['high', 'medium', 'low'].includes(data.impact) ? data.impact : null,
    effective_date: isoDate(data.effective_date),
    applies_to: (data.applies_to || []).filter((x) => ai.APPLIES_TO.includes(x)),
    topics: (data.topics || []).map(String).slice(0, 15),
    obligations: (data.obligations || []).slice(0, 100).map((o) => ({ what: String(o.what), who: String(o.who), deadline: isoDate(o.deadline), page: Number.isInteger(o.page) ? o.page : null })),
    deadlines: (data.deadlines || []).filter((d) => isoDate(d.date)).slice(0, 50).map((d) => ({ what: String(d.what), date: d.date })),
    amends: (data.amends || []).map(String).slice(0, 50),
    enforcement_actions: (data.enforcement_actions || []).slice(0, 50).map((a) => ({
      entity_name: String(a.entity_name).trim(),
      entity_type: rules.ENTITY_TYPES.includes(a.entity_type) ? a.entity_type : 'other',
      action_type: rules.ACTION_TYPES.includes(a.action_type) ? a.action_type : 'other',
      amount_inr: Number.isInteger(a.amount_inr) && a.amount_inr > 0 ? a.amount_inr : null,
      action_date: isoDate(a.action_date) || pub,
      reason: a.reason || null,
    })).filter((a) => a.entity_name),
    pdf_url: loaded ? loaded.pdfUrl : null,
    extraction: 'ai',
  };
  // If the AI missed a clear penalty headline, fall back to the rule-based parties.
  if (!r.enforcement_actions.length && rules.classify(doc).isEnforcement) {
    r.enforcement_actions = rulesResult(doc, loaded).enforcement_actions;
  }
  return r;
}

async function processDocument(doc) {
  const source = SOURCES.find((s) => s.id === doc.source_id) || null;
  let loaded = null;
  try {
    loaded = await fetcher.loadDocument(source, doc.url);
  } catch (e) {
    if (doc.attempts < 2) { store.markFailed(doc.id, 'Fetch failed: ' + e.message); return 'retry'; }
    // Give up on the page; the title alone still tells us a lot.
  }

  let result;
  let model = null;
  if (ai.enabled() && aiBudgetLeft() > 0 && (loaded?.text || loaded?.pdf)) {
    try {
      const out = await ai.extract({ regulator: doc.regulator, title: doc.title, url: doc.url, publishedAt: doc.published_at, text: loaded.text, pdf: loaded.pdf });
      logAi(out.usage);
      result = cleanAi(out.data, doc, loaded);
      model = out.model;
    } catch (e) {
      console.error('[regdata] AI extraction failed for', doc.id, e.message);
      if (doc.attempts < 2) { store.markFailed(doc.id, 'AI: ' + e.message); return 'retry'; }
    }
  }
  if (!result) result = rulesResult(doc, loaded);
  store.saveResult(doc.id, { ...result, model });
  webhooks.enqueueForDocument(doc.id);
  return result.extraction;
}

async function processPending(limit = 5) {
  const docs = db.prepare("SELECT * FROM reg_documents WHERE status = 'pending' ORDER BY published_at DESC LIMIT ?").all(limit);
  const out = [];
  for (const d of docs) {
    try { out.push([d.id, await processDocument(d)]); } catch (e) { store.markFailed(d.id, e.message); out.push([d.id, 'error']); }
  }
  return out;
}

// Admin: add any official document by URL (e.g. an older master direction).
async function addByUrl({ regulator, url, title }) {
  let t = title;
  if (!t) {
    try {
      const page = await fetcher.get(url, { maxBytes: 20 * 1024 * 1024 });
      const m = page.buf.toString('utf8', 0, 200000).match(/<title[^>]*>([^<]+)<\/title>/i);
      t = m ? rules.clean(m[1]) : url;
    } catch (_) { t = url; }
  }
  const c = rules.classify({ regulator, title: t, url });
  return store.addDocument({ source_id: 'manual', regulator, guid: url, url, title: t.slice(0, 500), published_at: Date.now(), doc_type: c.docType, is_enforcement: c.isEnforcement ? 1 : 0 });
}

module.exports = { collectSource, collectAll, processPending, processDocument, addByUrl, aiBudgetLeft };
