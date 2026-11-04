// Background jobs: check feeds, process documents, send webhooks.
const pipeline = require('./pipeline');
const webhooks = require('./webhooks');
const digest = require('./digest');
const ops = require('../ops');

const COLLECT_MIN = Math.max(Number(process.env.REGDATA_COLLECT_MINUTES || 30), 5);
const busy = { collect: false, process: false, deliver: false };

function guard(name, fn) {
  return async () => {
    if (busy[name]) return;
    busy[name] = true;
    try { await fn(); } catch (e) { console.error(`[regdata] ${name}:`, e.message); } finally { busy[name] = false; }
  };
}

const collect = guard('collect', async () => {
  const r = await pipeline.collectAll();
  const added = r.reduce((n, x) => n + (x.added || 0), 0);
  if (added) console.log(`[regdata] ${added} new documents`);
});
const processQ = guard('process', () => pipeline.processPending(5));
const deliver = guard('deliver', () => webhooks.deliverDue(20));
const hourly = guard('hourly', async () => {
  await digest.runDue();
  await ops.checkAndAlert();
  await ops.dailyReport();
});

function start() {
  setTimeout(collect, 15000).unref();
  setInterval(collect, COLLECT_MIN * 60000).unref();
  setInterval(processQ, 60000).unref();
  setInterval(deliver, 30000).unref();
  // Checked every 10 minutes; each job sends at most once in its hour.
  setInterval(hourly, 10 * 60000).unref();
  console.log(`[regdata] feeds checked every ${COLLECT_MIN} min`);
}

module.exports = { start, collect, processQ, deliver };
