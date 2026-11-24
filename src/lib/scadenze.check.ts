// Runnable check for the "in scadenza entro 2 settimane" list — node + assert, no framework.
// Run with: node src/lib/scadenze.check.ts
import assert from 'node:assert/strict';
import { daysUntil, expiringSoon } from './scadenze.ts';
import type { Visita } from './visite.ts';

const visit = (id: string, date: string, scadenza: string | null): Visita => ({
  id,
  sede: 'RSA X',
  sedeCampo: null,
  tipologia: 'AU',
  competenzeRichieste: [],
  date,
  startHour: 9,
  endHour: 11,
  teamLeaderId: '',
  teamLeaderName: '',
  teamLeaderCampo: null,
  evaluators: [],
  scadenza,
  congiuntaCon: null,
  posizione: null,
  confermata: false,
});

const TODAY = '2026-11-20';

assert.equal(daysUntil(TODAY, '2026-12-04'), 14, 'two weeks ahead');
assert.equal(daysUntil(TODAY, '2026-11-18'), -2, 'negative when already past');

const out = expiringSoon(
  [
    visit('in-14', '2026-11-25', '2026-12-04'), // last day of the window: in
    visit('in-15', '2026-11-25', '2026-12-05'), // one day too far: out
    visit('scaduta', '2026-11-28', '2026-11-18'), // expired, visit still to do: in, first
    visit('fatta', '2026-11-10', '2026-11-25'), // visit already done: out
    visit('oggi', '2026-11-20', '2026-11-20'), // visit today, expires today: in
    visit('senza', '2026-11-25', null), // no expiry known: out
  ],
  TODAY,
);
assert.deepEqual(out.map((e) => e.visita.id), ['scaduta', 'oggi', 'in-14'], 'window, past visits and missing expiry');
assert.deepEqual(out.map((e) => e.giorni), [-2, 0, 14], 'signed days to expiry');

// a visita congiunta is one row, not one per half: the half that expires first stands for both
const joint = expiringSoon(
  [
    { ...visit('au-1', '2026-11-25', '2026-12-02'), congiuntaCon: 'ac-1' },
    { ...visit('ac-1', '2026-11-25', '2026-11-28'), tipologia: 'AC', congiuntaCon: 'au-1' },
  ],
  TODAY,
);
assert.deepEqual(joint.map((e) => e.visita.id), ['ac-1'], 'one row per visita congiunta, the earliest expiry');

console.log('scadenze: all checks passed');
