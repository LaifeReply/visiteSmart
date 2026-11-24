// Runnable check for the random pratica and the visita congiunta lookup — node + assert, no framework.
// Run with: node src/lib/pratica.check.ts
import assert from 'node:assert/strict';
import { congiungibili, pescaPratica, type Pratica } from './pratica.ts';
import type { Visita } from './visite.ts';

const TODAY = '2026-11-24';
const visit = (id: string, sede: string, posizione: Visita['posizione']) => ({ id, sede, posizione }) as Visita;
const list = [
  visit('au-1', 'RSA di Padova', { lat: 45.4, lon: 11.9 }),
  visit('au-2', 'Senza coordinate', null),
  visit('ac-1', 'RSA di Padova', { lat: 45.4, lon: 11.9 }),
  visit('ac-2', 'Clinica di Verona', { lat: 45.44, lon: 10.99 }),
];

// ---- pescaPratica
assert.equal(pescaPratica([], TODAY), null, 'no visits, no pratica');
assert.equal(pescaPratica([visit('au-9', 'X', null)], TODAY), null, 'a sede without position is never drawn');
assert.deepEqual(pescaPratica(list, TODAY, () => 0), {
  sede: 'RSA di Padova',
  posizione: { lat: 45.4, lon: 11.9 },
  tipologia: 'AU',
  scadenza: '2026-12-24', // today + 30
});
assert.deepEqual(pescaPratica(list, TODAY, () => 0.99), {
  sede: 'Clinica di Verona',
  posizione: { lat: 45.44, lon: 10.99 },
  tipologia: 'AC',
  scadenza: '2027-09-18', // today + 30 + floor(0.99 * 271) = today + 298
});
const seen = new Set<string>();
for (let i = 0; i < 200; i++) seen.add(pescaPratica(list, TODAY)!.sede);
assert.deepEqual([...seen].sort(), ['Clinica di Verona', 'RSA di Padova'], 'each sede once, the one without position never');

// ---- congiungibili
const pratica: Pratica = { sede: 'RSA di Padova', posizione: { lat: 45.4, lon: 11.9 }, tipologia: 'AU', scadenza: '2026-12-20' };
const ac = (id: string, patch: Partial<Visita>): Visita =>
  ({ id, sede: 'RSA di Padova', tipologia: 'AC', date: '2026-11-27', startHour: 9, scadenza: '2027-01-10', congiuntaCon: null, ...patch }) as Visita;
const ids = (vs: Visita[]) => congiungibili(pratica, vs, TODAY, '2026-08-01', '2026-12-01').map((v) => v.id);

assert.deepEqual(ids([ac('ac-ok', {})]), ['ac-ok'], 'same sede, AC, upcoming, in window, expiries close');
assert.deepEqual(ids([ac('x', { sede: 'Altra' })]), [], 'another sede');
assert.deepEqual(ids([ac('x', { tipologia: 'AU' })]), [], 'same tipologia as the pratica');
assert.deepEqual(ids([ac('x', { congiuntaCon: 'au-5' })]), [], 'already a congiunta');
assert.deepEqual(ids([ac('x', { date: '2026-11-20' })]), [], 'already past');
assert.deepEqual(ids([ac('x', { scadenza: null })]), [], 'no expiry: 6 months rule cannot be checked');
assert.deepEqual(ids([ac('edge', { scadenza: '2027-06-21' })]), ['edge'], 'expiries exactly 183 days apart still join');
assert.deepEqual(ids([ac('x', { scadenza: '2027-06-22' })]), [], 'expiries 184 days apart: more than 6 months');
assert.deepEqual(ids([ac('x', { date: '2026-12-21' })]), [], 'date after the earlier expiry (the pratica, 2026-12-20)');
assert.deepEqual(ids([ac('x', { date: '2026-12-02', scadenza: '2027-01-10' })]), [], 'date outside the AC window');
assert.deepEqual(
  ids([ac('late', { date: '2026-11-30' }), ac('early', { date: '2026-11-25', startHour: 14 }), ac('first', { date: '2026-11-25' })]),
  ['first', 'early', 'late'],
  'earliest first',
);

console.log('pratica: all checks passed');
