// Runnable check for weekGrid — no test framework needed, just node + assert.
// Run with: node src/lib/weekGrid.check.ts
import assert from 'node:assert/strict';
import { buildWeekDays, formatWeekLabel, getEndHourOptions, getHourSlots, getWeekStart, isSameDay, parseIsoDate, toIsoDate } from './weekGrid.ts';

// getWeekStart must land on Monday for any day of the week, and never be after it.
for (let offset = 0; offset < 14; offset++) {
  const d = new Date(2026, 9, 1 + offset);
  const start = getWeekStart(d);
  assert.equal(start.getDay(), 1, `week start for ${d.toDateString()} must be Monday`);
  const diffDays = (d.getTime() - start.getTime()) / 86_400_000;
  assert.ok(diffDays >= 0 && diffDays < 7, 'date must fall within its own week');
}

const week = buildWeekDays(getWeekStart(new Date(2026, 9, 14)));
assert.equal(week.length, 7, 'week must have 7 days');
assert.equal(week[0].getDay(), 1, 'first day must be Monday');
assert.equal(week[6].getDay(), 0, 'last day must be Sunday');
for (let i = 1; i < 7; i++) {
  assert.equal((week[i].getTime() - week[i - 1].getTime()) / 86_400_000, 1, 'days must be consecutive');
}

assert.deepEqual(getHourSlots(), [9, 10, 11, 12, 13, 14, 15, 16, 17], 'hours must run 9 to 17 (9-18 range)');

assert.deepEqual(getEndHourOptions(9), [10, 11, 12, 13, 14, 15, 16, 17, 18], 'end options after 9 run 10 to 18');
assert.deepEqual(getEndHourOptions(17), [18], 'end options after 17 only allow 18');
assert.deepEqual(getEndHourOptions(null), [10, 11, 12, 13, 14, 15, 16, 17, 18], 'no start picked yet still offers the full end range');

const sameMonthLabel = formatWeekLabel(new Date(2026, 9, 12), new Date(2026, 9, 18));
assert.ok(
  sameMonthLabel.includes('12') &&
    sameMonthLabel.includes('18') &&
    sameMonthLabel.toLowerCase().includes('ottobre') &&
    sameMonthLabel.includes('2026'),
  `unexpected same-month label: ${sameMonthLabel}`,
);

const crossMonthLabel = formatWeekLabel(new Date(2026, 9, 26), new Date(2026, 10, 1));
assert.ok(
  crossMonthLabel.includes('26') &&
    crossMonthLabel.includes('1') &&
    crossMonthLabel.toLowerCase().includes('ottobre') &&
    crossMonthLabel.toLowerCase().includes('novembre') &&
    crossMonthLabel.includes('2026'),
  `unexpected cross-month label: ${crossMonthLabel}`,
);

const sample = new Date(2026, 10, 7); // 7 novembre 2026
assert.equal(toIsoDate(sample), '2026-11-07', 'toIsoDate zero-pads month and day');
assert.ok(isSameDay(parseIsoDate('2026-11-07'), sample), 'parseIsoDate/toIsoDate round-trip to the same day');

console.log('weekGrid: all checks passed');
