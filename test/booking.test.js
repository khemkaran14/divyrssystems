const test = require('node:test');
const assert = require('node:assert');
const { availableSlots, nowIn, addDays } = require('../src/services/booking');

const page = { days: '0,1,2,3,4,5,6', start_time: '10:00', end_time: '12:00', duration: 30, tz: 'Asia/Kolkata' };

test('slots fill working hours without spilling past the end time', () => {
  const tomorrow = addDays(nowIn(page.tz).date, 1);
  const day = availableSlots(page, []).find((d) => d.date === tomorrow);
  assert.deepStrictEqual(day.times, ['10:00', '10:30', '11:00', '11:30']);
  const longer = availableSlots({ ...page, duration: 45 }, []).find((d) => d.date === tomorrow);
  assert.deepStrictEqual(longer.times, ['10:00', '10:45']);
});

test('booked slots are hidden', () => {
  const tomorrow = addDays(nowIn(page.tz).date, 1);
  const day = availableSlots(page, [{ date: tomorrow, time: '10:30' }]).find((d) => d.date === tomorrow);
  assert.ok(!day.times.includes('10:30'));
});

test('only working days are offered', () => {
  const slots = availableSlots({ ...page, days: '1' }, []);
  for (const d of slots) assert.strictEqual(new Date(d.date + 'T00:00:00Z').getUTCDay(), 1);
  assert.ok(slots.length >= 2);
});
