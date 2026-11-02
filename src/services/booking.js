// Slot maths for booking pages. Dates and times are kept as wall-clock
// strings in the owner's timezone ("2026-11-05", "14:30"), so no conversions.
const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC',
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_AHEAD = 21;

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

function nowIn(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Returns [{ date, label, times: ['10:00', ...] }] for days that have free slots.
function availableSlots(page, taken) {
  const days = page.days.split(',').map(Number);
  const start = toMin(page.start_time);
  const end = toMin(page.end_time);
  const now = nowIn(page.tz);
  const takenSet = new Set(taken.map((b) => b.date + ' ' + b.time));
  const out = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = addDays(now.date, i);
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    if (!days.includes(dow)) continue;
    const times = [];
    for (let t = start; t + page.duration <= end; t += page.duration) {
      if (i === 0 && t <= now.minutes + 30) continue; // need at least 30 min notice
      const hhmm = toHHMM(t);
      if (!takenSet.has(date + ' ' + hhmm)) times.push(hhmm);
    }
    if (times.length) {
      const d = new Date(date + 'T00:00:00Z');
      const label = DAY_NAMES[dow] + ', ' + d.getUTCDate() + ' ' + d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      out.push({ date, label, times });
    }
  }
  return out;
}

module.exports = { TIMEZONES, DAY_NAMES, availableSlots, nowIn, addDays, toMin };
