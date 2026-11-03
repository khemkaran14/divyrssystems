#!/usr/bin/env node
// RegData jobs by hand:
//   node bin/regdata.js check      fetch each feed once and show what it contains (saves nothing)
//   node bin/regdata.js collect    fetch feeds and save new items
//   node bin/regdata.js process 20 read + extract up to 20 pending items
//   node bin/regdata.js status     counts and feed health
require('../src/config');
const fetcher = require('../src/regdata/fetch');
const { SOURCES } = require('../src/regdata/sources');
const rules = require('../src/regdata/rules');

(async () => {
  const [cmd = 'status', arg] = process.argv.slice(2);
  if (cmd === 'check') {
    for (const s of SOURCES) {
      try {
        const items = fetcher.parseFeed((await fetcher.get(s.url)).buf.toString('utf8'));
        console.log(`\n✔ ${s.id}: ${items.length} items`);
        for (const it of items.slice(0, 5)) {
          const c = rules.classify({ regulator: s.regulator, title: it.title, url: it.link });
          console.log(`  - [${c.docType}${c.isEnforcement ? ', ENFORCEMENT' : ''}] ${it.title.slice(0, 100)}`);
          if (c.isEnforcement) console.log('      parties:', rules.actionsFromTitle({ regulator: s.regulator, title: it.title }).map((a) => a.entity_name).join(' | ') || '(none found)');
        }
      } catch (e) {
        console.log(`\n✘ ${s.id}: ${e.message}`);
      }
    }
    return;
  }
  const pipeline = require('../src/regdata/pipeline');
  const store = require('../src/regdata/store');
  if (cmd === 'collect') console.log(await pipeline.collectAll());
  else if (cmd === 'process') console.log(await pipeline.processPending(Number(arg) || 10));
  else {
    console.log(store.stats());
    console.log(store.db.prepare('SELECT id, last_status, last_error, items_seen, datetime(last_fetched/1000, "unixepoch") AS checked FROM reg_sources').all());
  }
})().catch((e) => { console.error(e); process.exit(1); });
