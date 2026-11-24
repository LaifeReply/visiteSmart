import type { Campo } from './team.ts';
import { kmBetween, type Point } from './vincoli.ts';

export interface EvaluatorAssignment {
  id: string;
  name: string;
  campo: Campo | null;
}

export interface Visita {
  id: string;
  sede: string;
  sedeCampo: Campo | null;
  tipologia: 'AU' | 'AC';
  competenzeRichieste: string[];
  date: string; // ISO yyyy-mm-dd
  startHour: number;
  endHour: number;
  teamLeaderId: string;
  teamLeaderName: string;
  teamLeaderCampo: Campo | null;
  evaluators: EvaluatorAssignment[];
  scadenza: string | null; // expiry of this AU/AC (yyyy-mm-dd): a visita congiunta must happen by the earlier of its two
  congiuntaCon: string | null; // id of the paired visit once merged into a visita congiunta (AU+AC)
  posizione: { lat: number; lon: number } | null; // where the sede is: the 50 km team constraint is measured to it
  confermata: boolean; // confirmed by the coordinator: the visit will be done
}

export interface VisitaFilters {
  sede: string; // substring, case-insensitive
  teamLeaderId: string; // '' = any team leader
  fromHour: number | null; // together with toHour: keep visits overlapping [fromHour, toHour)
  toHour: number | null;
  date: string; // yyyy-mm-dd, '' = any day
  ulssId: number | null; // ULSS whose territory the sede is in (see ulssOf)
}

export const NO_FILTERS: VisitaFilters = { sede: '', teamLeaderId: '', fromHour: null, toHour: null, date: '', ulssId: null };

export const hasActiveFilters = (f: VisitaFilters): boolean =>
  f.sede.trim() !== '' ||
  f.teamLeaderId !== '' ||
  f.fromHour !== null ||
  f.toHour !== null ||
  f.date !== '' ||
  f.ulssId !== null;

export type UlssCenter = Point & { id: number; nome: string };

/** The ULSS a sede belongs to: the one with the nearest center. */
// ponytail: nearest center, not the real territorial borders; store sedi.ulss_id when real data comes with it
export function ulssOf(posizione: Point | null, ulss: UlssCenter[]): number | null {
  if (!posizione || ulss.length === 0) return null;
  return ulss.reduce((best, u) => (kmBetween(u, posizione) < kmBetween(best, posizione) ? u : best)).id;
}

/** Visits on site: a visita congiunta is one visit, so its AC half is not counted again (same as the calendar and the workload). */
export const countVisite = (list: Visita[]): number => list.filter((v) => !(v.tipologia === 'AC' && v.congiuntaCon)).length;

export function filterVisite(list: Visita[], f: VisitaFilters, ulss: UlssCenter[] = []): Visita[] {
  const q = f.sede.trim().toLowerCase();
  return list.filter(
    (i) =>
      (!q || i.sede.toLowerCase().includes(q)) &&
      (!f.date || i.date === f.date) &&
      (f.ulssId === null || ulssOf(i.posizione, ulss) === f.ulssId) &&
      (!f.teamLeaderId || i.teamLeaderId === f.teamLeaderId) &&
      (f.fromHour === null || i.endHour > f.fromHour) &&
      (f.toHour === null || i.startHour < f.toHour),
  );
}
