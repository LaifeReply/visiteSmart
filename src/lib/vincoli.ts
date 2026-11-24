// Team constraints: they hold for the team leader and for every evaluator. Same rules as _team_problems in
// backend/main.py, which re-checks them on save; here they decide who the form offers and why others are left out.

/** Max distance from a person's ULSS di riferimento to the sede being visited. */
export const MAX_KM = 50;
/** Same person, same day: hours from the end of one visit to the start of the next. */
export const GAP_HOURS = 3;

export interface Point {
  lat: number;
  lon: number;
}

export interface Candidate {
  id: string;
  ulss: (Point & { nome: string }) | null;
  sedeRiferimento: string | null;
}

/** The visit a team is being composed for, with the date/time currently in the form. */
export interface Slot {
  ids: string[]; // this visit and, for a visita congiunta, its other half: never a clash with itself
  sede: string;
  posizione: Point | null; // where the sede is
  date: string;
  startHour: number;
  endHour: number;
}

/** Another visit someone already takes part in, as far as the schedule check needs it. */
export interface Busy {
  id: string;
  date: string;
  startHour: number;
  endHour: number;
  sede: string;
}

export type Motivo = 'distanza' | 'conflitto' | 'orario';
export interface Problema {
  motivo: Motivo;
  testo: string;
}

/** Great-circle distance (haversine) in km. */
export function kmBetween(a: Point, b: Point): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/**
 * Why `person` can't be on the team of `slot` (empty = they can). `busy` = the other visits this person is on, that
 * day. A missing position (no ULSS, sede without coordinates) can't be measured, so it doesn't block.
 */
export function problemi(person: Candidate, slot: Slot, busy: Busy[]): Problema[] {
  const out: Problema[] = [];
  if (person.sedeRiferimento && person.sedeRiferimento.trim().toLowerCase() === slot.sede.trim().toLowerCase()) {
    out.push({ motivo: 'conflitto', testo: 'conflitto di interesse: è la sua sede di riferimento' });
  }
  if (person.ulss && slot.posizione) {
    const km = kmBetween(person.ulss, slot.posizione);
    if (km > MAX_KM) out.push({ motivo: 'distanza', testo: `${person.ulss.nome} a ${Math.round(km)} km dalla sede (massimo ${MAX_KM})` });
  }
  const clash = busy.find(
    (b) =>
      b.date === slot.date &&
      !slot.ids.includes(b.id) &&
      !(b.endHour + GAP_HOURS <= slot.startHour || slot.endHour + GAP_HOURS <= b.startHour),
  );
  if (clash) {
    out.push({
      motivo: 'orario',
      testo: `ha già una visita ${hh(clash.startHour)}–${hh(clash.endHour)} (${clash.sede}): servono ${GAP_HOURS} ore tra due visite`,
    });
  }
  return out;
}

/** Visits of one day by participant (team leader or evaluator), for the schedule check. */
export function busyByPerson(
  visite: { id: string; date: string; startHour: number; endHour: number; sede: string; teamLeaderId: string; evaluators: { id: string }[] }[],
  date: string,
): Map<string, Busy[]> {
  const map = new Map<string, Busy[]>();
  for (const v of visite) {
    if (v.date !== date) continue;
    for (const pid of new Set([v.teamLeaderId, ...v.evaluators.map((e) => e.id)])) {
      if (!pid) continue;
      const list = map.get(pid);
      const b = { id: v.id, date: v.date, startHour: v.startHour, endHour: v.endHour, sede: v.sede };
      if (list) list.push(b);
      else map.set(pid, [b]);
    }
  }
  return map;
}
