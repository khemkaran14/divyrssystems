const db = require('./schema');
const config = require('../config');
const { normalizeName, nameSimilarity } = require('./rules');

const parse = (s, d) => { try { return JSON.parse(s); } catch (_) { return d; } };
const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

// ---------------------------------------------------------------- write
const insertDoc = db.prepare(`INSERT OR IGNORE INTO reg_documents
  (source_id, regulator, guid, url, title, published_at, doc_type, is_enforcement, created_at, updated_at)
  VALUES (@source_id, @regulator, @guid, @url, @title, @published_at, @doc_type, @is_enforcement, @now, @now)`);

function addDocument(d) {
  const r = insertDoc.run({ ...d, now: Date.now() });
  return r.changes ? Number(r.lastInsertRowid) : null;
}

const saveResult = db.transaction((id, r) => {
  const now = Date.now();
  db.prepare(`UPDATE reg_documents SET doc_type=?, ref_no=?, summary=?, impact=?, effective_date=?, applies_to=?, topics=?,
      obligations=?, deadlines=?, amends=?, pdf_url=?, is_enforcement=?, status='ready', extraction=?, model=?, error=NULL, updated_at=?
      WHERE id=?`).run(
    r.doc_type, r.ref_no || null, r.summary || null, r.impact || null, r.effective_date || null,
    JSON.stringify(r.applies_to || []), JSON.stringify(r.topics || []), JSON.stringify(r.obligations || []),
    JSON.stringify(r.deadlines || []), JSON.stringify(r.amends || []), r.pdf_url || null,
    r.enforcement_actions && r.enforcement_actions.length ? 1 : 0, r.extraction, r.model || null, now, id);

  const doc = db.prepare('SELECT * FROM reg_documents WHERE id = ?').get(id);
  db.prepare('DELETE FROM reg_documents_fts WHERE rowid = ?').run(id);
  db.prepare('INSERT INTO reg_documents_fts (rowid, title, summary) VALUES (?, ?, ?)').run(id, doc.title, doc.summary || '');

  const old = db.prepare('SELECT id FROM reg_actions WHERE document_id = ?').all(id);
  for (const a of old) db.prepare('DELETE FROM reg_actions_fts WHERE rowid = ?').run(a.id);
  db.prepare('DELETE FROM reg_actions WHERE document_id = ?').run(id);
  for (const a of r.enforcement_actions || []) {
    const norm = normalizeName(a.entity_name);
    if (!norm) continue;
    const info = db.prepare(`INSERT INTO reg_actions (document_id, regulator, entity_name, entity_norm, entity_type, action_type,
        amount_inr, action_date, reason, url, pdf_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, doc.regulator, a.entity_name.slice(0, 300), norm, a.entity_type || 'other', a.action_type || 'other',
        Number.isFinite(a.amount_inr) ? a.amount_inr : null, a.action_date || day(doc.published_at),
        a.reason ? String(a.reason).slice(0, 1000) : null, doc.url, r.pdf_url || null, now);
    db.prepare('INSERT INTO reg_actions_fts (rowid, entity_norm) VALUES (?, ?)').run(info.lastInsertRowid, norm);
  }
});

function markFailed(id, error) {
  db.prepare("UPDATE reg_documents SET attempts = attempts + 1, error = ?, status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END, updated_at = ? WHERE id = ?")
    .run(String(error).slice(0, 500), Date.now(), id);
}

// ---------------------------------------------------------------- read / format
function formatChange(d, { full = true } = {}) {
  const out = {
    id: `chg_${d.id}`,
    regulator: d.regulator,
    title: d.title,
    doc_type: d.doc_type,
    ref_no: d.ref_no,
    published: day(d.published_at),
    effective_date: d.effective_date,
    impact: d.impact,
    applies_to: parse(d.applies_to, []),
    topics: parse(d.topics, []),
    summary: d.summary,
    url: d.url,
    pdf_url: d.pdf_url,
    is_enforcement: !!d.is_enforcement,
    verified: d.review_status === 'verified',
    extraction: d.extraction,
    page: `${config.baseUrl}/regdata/changes/${d.id}`,
  };
  if (full) {
    out.obligations = parse(d.obligations, []);
    out.deadlines = parse(d.deadlines, []);
    out.amends = parse(d.amends, []);
  }
  return out;
}

function formatAction(a, score) {
  const out = {
    id: `act_${a.id}`,
    regulator: a.regulator,
    entity_name: a.entity_name,
    entity_type: a.entity_type,
    action_type: a.action_type,
    amount_inr: a.amount_inr,
    action_date: a.action_date,
    reason: a.reason,
    url: a.url,
    pdf_url: a.pdf_url,
    change_id: `chg_${a.document_id}`,
  };
  if (score !== undefined) out.match_confidence = Math.round(score * 100) / 100;
  return out;
}

const ftsQuery = (q) => String(q).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1).slice(0, 10)
  .map((w) => `"${w}"*`).join(' ');

// filters: regulator, type, impact, applies_to, since, until, q, enforcement, maxPublished, limit, before (cursor id)
function listChanges(f = {}) {
  const where = ["d.status = 'ready'", "d.review_status != 'rejected'"];
  const args = [];
  let from = 'reg_documents d';
  if (f.q) {
    const fq = ftsQuery(f.q);
    if (fq) { from += ' JOIN reg_documents_fts ON reg_documents_fts.rowid = d.id'; where.push('reg_documents_fts MATCH ?'); args.push(fq); }
  }
  if (f.regulator) { where.push(`d.regulator IN (${f.regulator.map(() => '?').join(',')})`); args.push(...f.regulator); }
  if (f.type) { where.push(`d.doc_type IN (${f.type.map(() => '?').join(',')})`); args.push(...f.type); }
  if (f.impact) { where.push(`d.impact IN (${f.impact.map(() => '?').join(',')})`); args.push(...f.impact); }
  if (f.applies_to) {
    where.push(`(${f.applies_to.map(() => "d.applies_to LIKE ?").join(' OR ')})`);
    args.push(...f.applies_to.map((a) => `%"${a.replace(/[%_"]/g, '')}"%`));
  }
  if (f.enforcement !== undefined) { where.push('d.is_enforcement = ?'); args.push(f.enforcement ? 1 : 0); }
  if (f.since) { where.push('d.published_at >= ?'); args.push(f.since); }
  if (f.until) { where.push('d.published_at < ?'); args.push(f.until); }
  if (f.maxPublished) { where.push('d.published_at <= ?'); args.push(f.maxPublished); }
  if (f.before) { where.push('d.id < ?'); args.push(f.before); }
  const limit = Math.min(Math.max(parseInt(f.limit, 10) || 20, 1), 100);
  const rows = db.prepare(`SELECT d.* FROM ${from} WHERE ${where.join(' AND ')} ORDER BY d.published_at DESC, d.id DESC LIMIT ?`).all(...args, limit + 1);
  const more = rows.length > limit;
  return { rows: rows.slice(0, limit), more };
}

function getChange(id) {
  return db.prepare("SELECT * FROM reg_documents WHERE id = ? AND status = 'ready' AND review_status != 'rejected'").get(id) || null;
}

// Fuzzy name search: FTS finds candidates, then similarity scoring ranks them.
function searchActions({ name, regulator, since, maxDate, minConfidence = 0.6, limit = 20 }) {
  const norm = normalizeName(name);
  if (!norm) return [];
  const words = norm.split(' ').filter((w) => w.length > 1);
  if (!words.length) return [];
  const cand = new Map();
  const run = (match) => {
    try {
      for (const r of db.prepare('SELECT rowid FROM reg_actions_fts WHERE reg_actions_fts MATCH ? LIMIT 2000').all(match)) cand.set(r.rowid, true);
    } catch (_) { /* bad fts syntax: ignore */ }
  };
  run(words.map((w) => `"${w}"*`).join(' '));       // all words
  if (cand.size < 50) run(words.map((w) => `"${w}"*`).join(' OR '));   // any word (for spelling variants)
  if (!cand.size) return [];
  const ids = [...cand.keys()].slice(0, 2000);
  let rows = db.prepare(`SELECT * FROM reg_actions WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  if (regulator) rows = rows.filter((r) => regulator.includes(r.regulator));
  if (since) rows = rows.filter((r) => (r.action_date || '') >= since);
  if (maxDate) rows = rows.filter((r) => (r.action_date || '') <= maxDate);
  return rows
    .map((r) => ({ r, s: nameSimilarity(norm, r.entity_norm) }))
    .filter((x) => x.s >= minConfidence)
    .sort((a, b) => b.s - a.s || String(b.r.action_date).localeCompare(String(a.r.action_date)))
    .slice(0, Math.min(Math.max(limit, 1), 100))
    .map((x) => formatAction(x.r, x.s));
}

function listActions({ regulator, actionType, since, maxDate, limit = 20, before } = {}) {
  const where = ['1=1'];
  const args = [];
  if (regulator) { where.push(`regulator IN (${regulator.map(() => '?').join(',')})`); args.push(...regulator); }
  if (actionType) { where.push(`action_type IN (${actionType.map(() => '?').join(',')})`); args.push(...actionType); }
  if (since) { where.push('action_date >= ?'); args.push(since); }
  if (maxDate) { where.push('action_date <= ?'); args.push(maxDate); }
  if (before) { where.push('id < ?'); args.push(before); }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const rows = db.prepare(`SELECT * FROM reg_actions WHERE ${where.join(' AND ')} ORDER BY action_date DESC, id DESC LIMIT ?`).all(...args, lim + 1);
  return { rows: rows.slice(0, lim), more: rows.length > lim };
}

function stats() {
  return {
    documents: db.prepare("SELECT COUNT(*) n FROM reg_documents WHERE status='ready'").get().n,
    actions: db.prepare('SELECT COUNT(*) n FROM reg_actions').get().n,
    pending: db.prepare("SELECT COUNT(*) n FROM reg_documents WHERE status='pending'").get().n,
    failed: db.prepare("SELECT COUNT(*) n FROM reg_documents WHERE status='failed'").get().n,
    unreviewed: db.prepare("SELECT COUNT(*) n FROM reg_documents WHERE status='ready' AND review_status='unreviewed' AND impact='high'").get().n,
    latest: db.prepare("SELECT MAX(published_at) t FROM reg_documents WHERE status='ready'").get().t,
  };
}

module.exports = { db, addDocument, saveResult, markFailed, formatChange, formatAction, listChanges, getChange, searchActions, listActions, stats, day };
