import type { Visita } from './visite.ts';

/** How far ahead the "in scadenza" box looks. */
export const EXPIRING_DAYS = 14;

const DAY_MS = 86_400_000;

/** Signed whole days from `fromISO` to `toISO` (negative when `toISO` is earlier). Both parsed as UTC midnight. */
export const daysUntil = (fromISO: string, toISO: string): number => Math.round((Date.parse(toISO) - Date.parse(fromISO)) / DAY_MS);

export interface Expiring {
  visita: Visita;
  giorni: number; // days from today to its expiry; negative = already expired
}

/**
 * Visits still to be done (date today or later) whose expiry falls within `days` from today, or has already passed:
 * the ones that need attention first. Most urgent first (earliest expiry, then earliest visit).
 * A visita congiunta is one visit on site: only its half that expires first is listed.
 */
export function expiringSoon(visite: Visita[], todayISO: string, days = EXPIRING_DAYS): Expiring[] {
  const listed = new Set<string>();
  return visite
    .filter((v) => v.scadenza && v.date >= todayISO && daysUntil(todayISO, v.scadenza) <= days)
    .map((visita) => ({ visita, giorni: daysUntil(todayISO, visita.scadenza!) }))
    .sort((a, b) => a.giorni - b.giorni || a.visita.date.localeCompare(b.visita.date) || a.visita.id.localeCompare(b.visita.id))
    .filter(({ visita }) => {
      if (visita.congiuntaCon && listed.has(visita.congiuntaCon)) return false;
      listed.add(visita.id);
      return true;
    });
}
