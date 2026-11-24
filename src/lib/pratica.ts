import { isWithinAccreditationWindow } from './accreditationWindow.ts';
import type { Point } from './vincoli.ts';
import type { Visita } from './visite.ts';

/** The case a new visit is for: sede, tipologia and expiry come from the process upstream, the team is composed here. */
export interface Pratica {
  sede: string;
  posizione: Point;
  tipologia: 'AU' | 'AC';
  scadenza: string; // yyyy-mm-dd: the visit must happen by then; a visita congiunta by the earlier of the two expiries
}

export const JOINT_MAX_DAYS = 183; // V-11: AU and AC expiries at most 6 months apart

const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS);

/**
 * Demo stand-in for the process: a random sede among those on the calendar, a random tipologia and an expiry 30–300
 * days from today. Only sedi with a position: without one the 50 km rule could not be checked.
 */
export function pescaPratica(visite: Visita[], todayISO: string, rnd: () => number = Math.random): Pratica | null {
  const sedi = new Map<string, Point>();
  for (const v of visite) if (v.posizione && !sedi.has(v.sede)) sedi.set(v.sede, v.posizione);
  const list = [...sedi];
  if (list.length === 0) return null;
  const [sede, posizione] = list[Math.floor(rnd() * list.length)];
  const tipologia = rnd() < 0.5 ? 'AU' : 'AC';
  return { sede, posizione, tipologia, scadenza: addDays(todayISO, 30 + Math.floor(rnd() * 271)) };
}

/**
 * Visits already on the calendar the pratica can join as a visita congiunta (AU+AC), keeping their date, time and
 * team: same sede, the other tipologia, still to come, not joined yet, expiries ≤ 6 months apart, date not after the
 * earlier expiry and inside the AC window (a congiunta always has an AC half). Earliest first.
 */
export function congiungibili(
  pratica: Pratica,
  visite: Visita[],
  todayISO: string,
  acWindowStart: string,
  acWindowEnd: string,
): Visita[] {
  return visite
    .filter(
      (v) =>
        v.sede === pratica.sede &&
        v.tipologia !== pratica.tipologia &&
        !v.congiuntaCon &&
        v.date >= todayISO &&
        !!v.scadenza &&
        daysBetween(v.scadenza, pratica.scadenza) <= JOINT_MAX_DAYS &&
        v.date <= [v.scadenza, pratica.scadenza].sort()[0] &&
        isWithinAccreditationWindow(v.date, acWindowStart, acWindowEnd),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);
}
