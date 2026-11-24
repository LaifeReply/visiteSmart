// Runnable check for the calendar filters — node + assert, no framework.
// Run with: node src/lib/visite.check.ts
import assert from 'node:assert/strict';
import { countVisite, filterVisite, hasActiveFilters, NO_FILTERS, type Visita } from './visite.ts';

const visit = (id: string, sede: string, teamLeaderId: string, startHour: number, endHour: number): Visita => ({
  id,
  sede,
  sedeCampo: null,
  tipologia: 'AU',
  competenzeRichieste: [],
  date: '2026-11-10',
  startHour,
  endHour,
  teamLeaderId,
  teamLeaderName: '',
  teamLeaderCampo: null,
  evaluators: [],
  scadenza: null,
  congiuntaCon: null,
  posizione: null,
  confermata: false,
});

const list = [
  { ...visit('a', 'RSA di Verona', '1', 9, 11), posizione: { lat: 45.44, lon: 10.99 } },
  { ...visit('b', 'Clinica Villa Verde', '2', 11, 13), date: '2026-11-11' },
  { ...visit('c', 'RSA di Padova', '1', 14, 17), posizione: { lat: 45.41, lon: 11.88 } },
];
const ULSS = [
  { id: 6, nome: 'ULSS 6 Euganea', lat: 45.4064, lon: 11.8768 },
  { id: 9, nome: 'ULSS 9 Scaligera', lat: 45.4384, lon: 10.9916 },
];
const ids = (f: Parameters<typeof filterVisite>[1]) => filterVisite(list, f, ULSS).map((i) => i.id);

assert.deepEqual(ids(NO_FILTERS), ['a', 'b', 'c'], 'no filters keeps everything');
assert.equal(hasActiveFilters(NO_FILTERS), false, 'default filters are inactive');
assert.equal(hasActiveFilters({ ...NO_FILTERS, sede: '  ' }), false, 'a blank sede is not a filter');

assert.deepEqual(ids({ ...NO_FILTERS, sede: 'rsa' }), ['a', 'c'], 'sede matches a substring, case-insensitive');
assert.deepEqual(ids({ ...NO_FILTERS, teamLeaderId: '1' }), ['a', 'c'], 'team leader keeps only their visits');

assert.deepEqual(ids({ ...NO_FILTERS, fromHour: 11 }), ['b', 'c'], 'a visit ending exactly at fromHour is out (touching, not overlapping)');
assert.deepEqual(ids({ ...NO_FILTERS, toHour: 11 }), ['a'], 'a visit starting exactly at toHour is out');
assert.deepEqual(ids({ ...NO_FILTERS, fromHour: 10, toHour: 12 }), ['a', 'b'], 'any overlap with the range counts, even partial');
assert.deepEqual(ids({ ...NO_FILTERS, fromHour: 13, toHour: 14 }), [], 'a gap between visits matches nothing');

assert.deepEqual(ids({ ...NO_FILTERS, date: '2026-11-11' }), ['b'], 'date keeps only that day');
assert.deepEqual(ids({ ...NO_FILTERS, ulssId: 6 }), ['c'], 'ULSS = nearest center to the sede');
assert.deepEqual(ids({ ...NO_FILTERS, ulssId: 9 }), ['a'], 'ULSS 9 keeps the Verona sede; b has no position, so no ULSS');

assert.deepEqual(ids({ ...NO_FILTERS, sede: 'rsa', teamLeaderId: '1', fromHour: 12, toHour: 18 }), ['c'], 'filters combine with AND');

const auHalf = { ...visit('au-9', 'X', '1', 9, 10), congiuntaCon: 'ac-9' };
const acHalf = { ...visit('ac-9', 'X', '1', 9, 10), tipologia: 'AC' as const, congiuntaCon: 'au-9' };
assert.equal(countVisite([...list, auHalf, acHalf]), 4, 'a visita congiunta counts once');

console.log('visite: all checks passed');
