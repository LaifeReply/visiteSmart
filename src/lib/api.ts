import type { Campo } from './team';
import type { EvaluatorAssignment, Visita } from './visite';

const API_BASE = 'http://localhost:8000';

export interface TeamMember {
  id: string;
  name: string;
  competenze: string[];
  canLead: boolean;
  campi: Campo[]; // the person's own SA/SS (profile), read-only everywhere
  ulss: { id: number; nome: string; lat: number; lon: number } | null; // ULSS di riferimento (50 km limit)
  sedeRiferimento: string | null; // conflitto di interesse: never on a visit to this sede
  esterno: boolean; // external evaluator: flagged on their slot in the team form
}

export interface WorkloadRow {
  id: string;
  name: string;
  canLead: boolean;
  visiteTotali: number; // every visit on the calendar (a visita congiunta counts once): same for everyone
  visiteAssegnate: number;
  ratio: number; // visiteAssegnate / visiteTotali
}

export interface UpdateVisitaInput {
  date: string;
  startHour: number;
  endHour: number;
  teamLeaderId: string;
  evaluatorIds: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    // only requests with a body declare JSON: on a GET the header makes the browser send a CORS preflight first
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

function toEvaluator(e: { id: string; nome: string; campo: string | null }): EvaluatorAssignment {
  return { id: e.id, name: e.nome, campo: e.campo as Campo | null };
}

function toVisita(v: {
  id: string;
  tipologia: 'AU' | 'AC';
  sede: string;
  sedeCampo: string | null;
  competenzeRichieste: string[];
  date: string;
  startHour: number;
  endHour: number;
  teamLeaderId: string | null;
  teamLeaderNome: string | null;
  teamLeaderCampo: string | null;
  evaluators: { id: string; nome: string; campo: string | null }[];
  scadenza: string | null;
  congiuntaCon: string | null;
  sedeLat: number | null;
  sedeLon: number | null;
  confermata: boolean;
}): Visita {
  return {
    id: v.id,
    tipologia: v.tipologia,
    sede: v.sede,
    sedeCampo: v.sedeCampo as Campo | null,
    competenzeRichieste: v.competenzeRichieste,
    date: v.date,
    startHour: v.startHour,
    endHour: v.endHour,
    teamLeaderId: v.teamLeaderId ?? '',
    teamLeaderName: v.teamLeaderNome ?? '',
    teamLeaderCampo: v.teamLeaderCampo as Campo | null,
    evaluators: v.evaluators.map(toEvaluator),
    scadenza: v.scadenza,
    congiuntaCon: v.congiuntaCon,
    posizione: v.sedeLat !== null && v.sedeLon !== null ? { lat: v.sedeLat, lon: v.sedeLon } : null,
    confermata: v.confermata,
  };
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const people = await request<
    {
      id: string;
      nome: string;
      competenze: string[];
      canLead: boolean;
      campi: Campo[];
      ulss: { id: number; nome: string; lat: number; lon: number } | null;
      sedeRiferimento: string | null;
      esterno: boolean;
    }[]
  >('/team');
  return people.map((p) => ({
    id: p.id,
    name: p.nome,
    competenze: p.competenze,
    canLead: p.canLead,
    campi: p.campi,
    ulss: p.ulss,
    sedeRiferimento: p.sedeRiferimento,
    esterno: p.esterno,
  }));
}

export async function fetchVisite(): Promise<Visita[]> {
  const visite = await request<Parameters<typeof toVisita>[0][]>('/visite');
  return visite.map(toVisita);
}

export async function fetchWorkload(): Promise<WorkloadRow[]> {
  const rows = await request<{ id: string; nome: string; canLead: boolean; visiteTotali: number; visiteAssegnate: number; ratio: number }[]>('/workload');
  return rows.map((r) => ({
    id: r.id,
    name: r.nome,
    canLead: r.canLead,
    visiteTotali: r.visiteTotali,
    visiteAssegnate: r.visiteAssegnate,
    ratio: r.ratio,
  }));
}

type VisitaJson = Parameters<typeof toVisita>[0];

/** Returns the updated visit, plus its partner when it is a visita congiunta (both halves move together). */
export async function updateVisita(id: string, input: UpdateVisitaInput): Promise<Visita[]> {
  const list = await request<VisitaJson[]>(`/visite/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return list.map(toVisita);
}

export interface CreateVisitaInput extends UpdateVisitaInput {
  tipologia: 'AU' | 'AC';
  sede: string;
  scadenza: string; // the pratica's expiry
}

/** Schedules a new visit for a pratica; the server re-checks every team constraint (400 with the reason). */
export async function createVisita(input: CreateVisitaInput): Promise<Visita> {
  return toVisita(await request<VisitaJson>('/visite', { method: 'POST', body: JSON.stringify(input) }));
}

/** The pratica joins `visitaId` as its other half (AU+AC), inheriting date, time and team. Returns [that visit, new half]. */
export async function createCongiunta(visitaId: string, scadenza: string): Promise<Visita[]> {
  const list = await request<VisitaJson[]>('/congiunte', { method: 'POST', body: JSON.stringify({ visitaId, scadenza }) });
  return list.map(toVisita);
}

/** Confirms the visit (it will be done); a visita congiunta is confirmed whole. Returns the visit(s). */
export async function confermaVisita(id: string): Promise<Visita[]> {
  const list = await request<VisitaJson[]>(`/visite/${id}/conferma`, { method: 'POST' });
  return list.map(toVisita);
}

/** Deletes the visit from the DB (a visita congiunta whole). Returns the ids removed. */
export async function deleteVisita(id: string): Promise<string[]> {
  return request<string[]>(`/visite/${id}`, { method: 'DELETE' });
}

/** Splits a visita congiunta back into two separate visits. Returns both halves. */
export async function deleteCongiunta(visitaId: string): Promise<Visita[]> {
  const list = await request<VisitaJson[]>(`/congiunte/${visitaId}`, { method: 'DELETE' });
  return list.map(toVisita);
}
