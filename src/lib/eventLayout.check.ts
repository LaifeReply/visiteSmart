// Runnable check for the overlap-column layout — node + assert, no framework.
// Run with: node src/lib/eventLayout.check.ts
import assert from 'node:assert/strict';
import { groupByStartHour, layoutDayEvents } from './eventLayout.ts';

const byId = <T extends { event: { id: string } }>(laid: T[], id: string) =>
  laid.find((l) => l.event.id === id)!;

// Non-overlapping events share column 0 (stacked one after another, full width).
const disjoint = layoutDayEvents([
  { id: 'a', startHour: 9, endHour: 10 },
  { id: 'b', startHour: 11, endHour: 12 },
]);
assert.equal(byId(disjoint, 'a').columnCount, 1, 'non-overlapping events need only one column');
assert.equal(byId(disjoint, 'b').column, 0, 'non-overlapping events both land in column 0');

// A direct overlap needs two side-by-side columns.
const pair = layoutDayEvents([
  { id: 'a', startHour: 9, endHour: 11 },
  { id: 'b', startHour: 10, endHour: 12 },
]);
assert.equal(byId(pair, 'a').columnCount, 2, 'an overlapping pair gets a 2-column cluster');
assert.notEqual(byId(pair, 'a').column, byId(pair, 'b').column, 'overlapping events never share a column');

// A(9-12) overlaps both B and C, but B(10-11) and C(11-13) don't overlap each other —
// they should share one column while A takes the other; the cluster still only needs two columns.
const triple = layoutDayEvents([
  { id: 'a', startHour: 9, endHour: 12 },
  { id: 'b', startHour: 10, endHour: 11 },
  { id: 'c', startHour: 11, endHour: 13 },
]);
assert.ok(triple.every((l) => l.columnCount === 2), 'a transitively-linked trio still shares one cluster width');
assert.equal(byId(triple, 'b').column, byId(triple, 'c').column, 'non-conflicting siblings reuse the same column');
assert.notEqual(byId(triple, 'a').column, byId(triple, 'b').column, 'the event overlapping both sits in its own column');

// Three mutually-overlapping events (the real "same day, same hour" stress case) need three columns.
const triOverlap = layoutDayEvents([
  { id: 'a', startHour: 9, endHour: 11 },
  { id: 'b', startHour: 9, endHour: 13 },
  { id: 'c', startHour: 10, endHour: 12 },
]);
const columns = new Set(triOverlap.map((l) => l.column));
assert.equal(columns.size, 3, 'three mutually-overlapping events need three distinct columns');
assert.ok(triOverlap.every((l) => l.columnCount === 3), 'and every one of them reports that same cluster width');

// A crowded day splits by start hour, earliest first: 9 and 11 stay apart, two at 11 share a group.
const groups = groupByStartHour([
  { id: 'a', startHour: 11, endHour: 12 },
  { id: 'b', startHour: 9, endHour: 12 },
  { id: 'c', startHour: 11, endHour: 14 },
]);
assert.deepEqual(
  groups.map((g) => [g.hour, g.events.map((e) => e.id)]),
  [
    [9, ['b']],
    [11, ['a', 'c']],
  ],
  'one group per start hour, in hour order',
);

console.log('eventLayout: all checks passed');
