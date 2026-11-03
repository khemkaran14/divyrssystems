// Official feeds. Each source may only fetch pages and PDFs from its allowed hosts.
const SOURCES = [
  {
    id: 'rbi-notifications',
    regulator: 'RBI',
    name: 'RBI notifications & circulars',
    url: 'https://www.rbi.org.in/notifications_rss.xml',
    hosts: ['rbi.org.in', 'www.rbi.org.in', 'rbidocs.rbi.org.in', 'website.rbi.org.in'],
  },
  {
    id: 'rbi-press',
    regulator: 'RBI',
    name: 'RBI press releases (includes penalties)',
    url: 'https://www.rbi.org.in/pressreleases_rss.xml',
    hosts: ['rbi.org.in', 'www.rbi.org.in', 'rbidocs.rbi.org.in', 'website.rbi.org.in'],
  },
  {
    id: 'sebi-all',
    regulator: 'SEBI',
    name: 'SEBI circulars, orders & press releases',
    url: 'https://www.sebi.gov.in/sebirss.xml',
    hosts: ['sebi.gov.in', 'www.sebi.gov.in'],
  },
];

// Override or add feeds without code changes: REGDATA_SOURCES_JSON='[{"id":..,"regulator":..,"name":..,"url":..,"hosts":[..]}]'
if (process.env.REGDATA_SOURCES_JSON) {
  try {
    for (const s of JSON.parse(process.env.REGDATA_SOURCES_JSON)) {
      const i = SOURCES.findIndex((x) => x.id === s.id);
      if (i >= 0) SOURCES[i] = { ...SOURCES[i], ...s }; else SOURCES.push(s);
    }
  } catch (e) {
    console.error('REGDATA_SOURCES_JSON is not valid JSON:', e.message);
  }
}

const REGULATORS = [...new Set(SOURCES.map((s) => s.regulator))];

function hostAllowed(source, urlStr) {
  try {
    const h = new URL(urlStr).hostname.toLowerCase();
    return source.hosts.some((a) => h === a || h.endsWith('.' + a));
  } catch (_) {
    return false;
  }
}

module.exports = { SOURCES, REGULATORS, hostAllowed };
