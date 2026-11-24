// Runnable check for the team constraints — node + assert, no framework.
// Run with: node src/lib/vincoli.check.ts
import assert from 'node:assert/strict';
import { busyByPerson, kmBetween, problemi, type Candidate, type Slot } from './vincoli.ts';

const PADOVA = { lat: 45.4064, lon: 11.8768 };
const VENEZIA = { lat: 45.4408, lon: 12.3155 };
const VERONA = { lat: 45.4384, lon: 10.9916 };

assert.ok(Math.abs(kmBetween(PADOVA, VENEZIA) - 34) < 3, 'Padova–Venezia is about 34 km');
assert.ok(kmBetween(PADOVA, VERONA) > 50, 'Padova–Verona is over 50 km');

const slot: Slot = { ids: ['au-1', 'ac-1'], sede: 'RSA di Venezia', posizione: VENEZIA, date: '2026-12-02', startHour: 14, endHour: 16 };
const person = (over: Partial<Candidate> = {}): Candidate => ({ id: '9', ulss: { nome: 'ULSS 6 Euganea', ...PADOVA }, sedeRiferimento: 'RSA di Padova', ...over });
const motivi = (p: Candidate, busy = []) => problemi(p, slot, busy).map((x) => x.motivo);

assert.deepEqual(motivi(person()), [], 'near, other sede, free: fine');
assert.deepEqual(motivi(person({ ulss: { nome: 'ULSS 9 Scaligera', ...VERONA } })), ['distanza'], 'ULSS over 50 km away');
assert.deepEqual(motivi(person({ sedeRiferimento: ' rsa di venezia' })), ['conflitto'], 'own sede, any case/spacing');
assert.deepEqual(motivi(person({ ulss: null })), [], 'no ULSS known: distance not checked');

// slot is 14-16: another visit must end by 11 or start from 19 (the 3 h are from end to start)
const day = (id: string, startHour: number, endHour: number, date = '2026-12-02') => ({ id, date, startHour, endHour, sede: 'Altra sede' });
const orario = (busy: ReturnType<typeof day>[]) => problemi(person(), slot, busy).map((x) => x.motivo);
assert.deepEqual(orario([day('au-7', 9, 11)]), [], 'ends 11:00, next starts 14:00: exactly 3 h, fine');
assert.deepEqual(orario([day('au-7', 9, 12)]), ['orario'], 'ends 12:00: only 2 h before 14:00');
assert.deepEqual(orario([day('au-7', 15, 17)]), ['orario'], 'overlapping visit');
assert.deepEqual(orario([day('au-7', 9, 12, '2026-12-03')]), [], 'another day does not count');
assert.deepEqual(orario([day('ac-1', 14, 16)]), [], 'the other half of this visita congiunta is not a clash');

// busyByPerson: TL and evaluators of that day, each visit once per person
const busy = busyByPerson(
  [
    { id: 'au-7', date: '2026-12-02', startHour: 9, endHour: 11, sede: 'X', teamLeaderId: '1', evaluators: [{ id: '2' }] },
    { id: 'au-8', date: '2026-12-03', startHour: 9, endHour: 11, sede: 'Y', teamLeaderId: '1', evaluators: [] },
  ],
  '2026-12-02',
);
assert.deepEqual([...busy.keys()].sort(), ['1', '2'], 'TL and evaluator both busy');
assert.equal(busy.get('1')!.length, 1, 'only the chosen day');

console.log('vincoli: all checks passed');
