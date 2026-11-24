import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Calendar from './components/Calendar';
import CreaVisitaForm, { type CreaVisitaSlot } from './components/CreaVisitaForm';
import ExpiringList from './components/ExpiringList';
import EditVisitaForm, { type EditVisitaPayload } from './components/EditVisitaForm';
import Modal from './components/Modal';
import TeamPanel from './components/TeamPanel';

// recharts is most of the bundle and only this modal needs it: load it on first open, not at startup
// the import is cached by the bundler, so calling it early (hover / click) just starts the download sooner
const loadWorkloadPanel = () => import('./components/WorkloadPanel');
const WorkloadPanel = lazy(loadWorkloadPanel);
import {
  createCongiunta,
  confermaVisita,
  createVisita,
  deleteCongiunta,
  deleteVisita,
  fetchTeam,
  fetchVisite,
  fetchWorkload,
  updateVisita,
  type TeamMember,
  type WorkloadRow,
} from './lib/api';
import { AC_WINDOW_END, AC_WINDOW_START } from './lib/accreditationWindow';
import { congiungibili, pescaPratica, type Pratica } from './lib/pratica';
import { expiringSoon } from './lib/scadenze';
import type { TeamSelection } from './lib/team';
import { countVisite, filterVisite, NO_FILTERS, type UlssCenter, type Visita, type VisitaFilters } from './lib/visite';
import { parseIsoDate, toIsoDate } from './lib/weekGrid';
import './App.css';

const formatItDate = (iso: string) => parseIsoDate(iso).toLocaleDateString('it-IT');
// ponytail: fixed at page load; a tab left open past midnight keeps counting from yesterday until reloaded
const TODAY = toIsoDate(new Date());
const EXPIRING_PREVIEW = 5; // rows shown in the sidebar box before "Vedi tutte"
const NO_TEAM: TeamSelection = {
  leaderId: null,
  evaluators: [{ id: '', campo: null }],
}; // one empty slot ready to fill

function App() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [visite, setVisite] = useState<Visita[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [editingVisita, setEditingVisita] = useState<Visita | null>(null);
  const [filters, setFilters] = useState<VisitaFilters>(NO_FILTERS);

  const [expiringOpen, setExpiringOpen] = useState(false);

  // new visit flow: compose the team for the pratica first, then pick date and time on the calendar
  const [fase, setFase] = useState<'team' | 'calendario'>('team');
  const [pratica, setPratica] = useState<Pratica | null>(null);
  const [teamSel, setTeamSel] = useState<TeamSelection>(NO_TEAM);
  const [creating, setCreating] = useState(false); // the "Crea nuova visita" form is open
  const [created, setCreated] = useState(false); // this pratica's visit exists: "Crea nuova visita" is hidden
  const [focusDate, setFocusDate] = useState<string | null>(null); // the created visit's date, for the calendar

  const [workloadOpen, setWorkloadOpen] = useState(false);
  const [workloadLoading, setWorkloadLoading] = useState(false);
  const [workload, setWorkload] = useState<WorkloadRow[] | null>(null);
  // one shared request for hover / focus / click, so the data is usually in flight before the click lands;
  // dropped when a visit edit makes it stale or when it fails (so the next open retries)
  const workloadRequest = useRef<Promise<WorkloadRow[]> | null>(null);
  const prefetchWorkload = () => {
    loadWorkloadPanel(); // chart code downloads in parallel with the data, not after it
    if (!workloadRequest.current) {
      workloadRequest.current = fetchWorkload();
      workloadRequest.current.catch(() => (workloadRequest.current = null));
    }
    return workloadRequest.current;
  };

  useEffect(() => {
    setApiError(null);
    Promise.all([fetchTeam(), fetchVisite()])
      .then(([teamData, visiteData]) => {
        setTeam(teamData);
        setVisite(visiteData);
        setPratica((prev) => prev ?? pescaPratica(visiteData, TODAY)); // dev StrictMode loads twice: draw once, or the pratica changes under a chosen team
      })
      .catch((e: unknown) => setApiError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ULSS centers come with the people (each has a ULSS di riferimento): one entry per ULSS, sorted by number
  const ulss = useMemo(() => {
    const byId = new Map<number, UlssCenter>();
    for (const m of team) if (m.ulss) byId.set(m.ulss.id, m.ulss);
    return [...byId.values()].sort((a, b) => a.id - b.id);
  }, [team]);
  const filteredVisite = useMemo(() => filterVisite(visite, filters, ulss), [visite, filters, ulss]);
  const teamLeaders = useMemo(() => team.filter((m) => m.canLead), [team]);

  const expiring = useMemo(() => expiringSoon(visite, TODAY), [visite]);
  const openFromExpiring = (v: Visita) => {
    setExpiringOpen(false); // the edit form takes over
    setEditingVisita(v);
  };
  // a visita congiunta must happen by the earlier of its two expiries (V-11)
  const editingPartner = editingVisita?.congiuntaCon
    ? visite.find((v) => v.id === editingVisita.congiuntaCon)
    : undefined;
  const editingDeadline =
    [editingVisita?.scadenza, editingPartner?.scadenza].filter((s): s is string => !!s).sort()[0] ?? null;

  /** Runs a write that returns changed visits (one, or both halves of a visita congiunta) and swaps them into state. */
  const applyChange = async (write: () => Promise<Visita[]>): Promise<Visita[] | null> => {
    setApiError(null);
    try {
      const list = await write();
      const changed = new Map(list.map((v) => [v.id, v]));
      setVisite((prev) => prev.map((v) => changed.get(v.id) ?? v));
      workloadRequest.current = null; // a team change moves the numbers: refetch on next open
      setWorkload(null);
      return list;
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  const handleUpdateVisita = async (payload: EditVisitaPayload) => {
    if (!editingVisita) return;
    if (await applyChange(() => updateVisita(editingVisita.id, payload))) setEditingVisita(null);
  };

  const handleConfirm = async (v: Visita) => {
    const list = await applyChange(() => confermaVisita(v.id));
    if (list && editingVisita?.id === v.id) setEditingVisita(list[0]);
  };

  const handleDelete = async (v: Visita) => {
    const what = v.congiuntaCon ? 'la visita congiunta AU+AC (entrambe le visite)' : `la visita ${v.tipologia}`;
    if (!window.confirm(`Eliminare ${what} di ${v.sede} del ${formatItDate(v.date)}? L'operazione non si può annullare.`)) return;
    setApiError(null);
    try {
      const removed = new Set(await deleteVisita(v.id));
      setVisite((prev) => prev.filter((x) => !removed.has(x.id)));
      workloadRequest.current = null; // one visit less moves every ratio
      setWorkload(null);
      if (editingVisita && removed.has(editingVisita.id)) setEditingVisita(null);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSplit = async (visitaId: string) => {
    if (await applyChange(() => deleteCongiunta(visitaId))) setEditingVisita(null);
  };

  const handleCreate = async (slot: CreaVisitaSlot): Promise<string | null> => {
    if (!pratica || !teamSel.leaderId) return 'Componi prima il team.';
    try {
      const visita = await createVisita({
        ...slot,
        tipologia: pratica.tipologia,
        sede: pratica.sede,
        scadenza: pratica.scadenza,
        teamLeaderId: teamSel.leaderId,
        evaluatorIds: teamSel.evaluators.filter((e) => e.id !== '').map((e) => e.id),
      });
      setVisite((prev) => [...prev, visita]);
      workloadRequest.current = null; // one more visit moves every ratio
      setWorkload(null);
      setCreating(false);
      setCreated(true);
      setFocusDate(visita.date);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  // V-11 on a new pratica: existing visits of the other tipologia at this sede it can join (AU+AC)
  const joinable = useMemo(
    () => (pratica ? congiungibili(pratica, visite, TODAY, AC_WINDOW_START, AC_WINDOW_END) : []),
    [pratica, visite],
  );
  const [joining, setJoining] = useState(false);
  const handleJoin = async (target: Visita) => {
    if (!pratica) return;
    setJoining(true);
    setApiError(null);
    try {
      const [updated, nuova] = await createCongiunta(target.id, pratica.scadenza);
      setVisite((prev) => [...prev.map((v) => (v.id === updated.id ? updated : v)), nuova]);
      workloadRequest.current = null;
      setWorkload(null);
      setCreated(true);
      setFocusDate(updated.date);
      setFase('calendario');
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setJoining(false);
    }
  };

  const nuovaPratica = () => {
    setPratica(pescaPratica(visite, TODAY));
    setTeamSel(NO_TEAM);
    setCreated(false);
    setFocusDate(null);
    setFase('team');
  };

  const handleOpenWorkload = async () => {
    setWorkloadOpen(true);
    if (workload) return; // still fresh: visits only change through handleUpdateVisita, which clears it
    setWorkloadLoading(true);
    setApiError(null);
    try {
      setWorkload(await prefetchWorkload());
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorkloadLoading(false);
    }
  };

  const workloadButton = (
    <button
      type="button"
      className="btn"
      onClick={handleOpenWorkload}
      onPointerEnter={prefetchWorkload}
      onFocus={prefetchWorkload}
    >
      Carico di lavoro
    </button>
  );

  return (
    <div className="app-shell">
      <header className="masthead">
        <span className="masthead-mark">Visite</span>
      </header>

      {loading ? (
        <p className="loading-state">Caricamento dati…</p>
      ) : fase === 'team' ? (
        pratica ? (
          <TeamPanel
            pratica={pratica}
            team={team}
            selection={teamSel}
            onChange={setTeamSel}
            onConfirm={() => setFase('calendario')}
            workloadButton={workloadButton}
            error={apiError}
            congiungibili={joinable}
            onJoin={handleJoin}
            joining={joining}
          />
        ) : (
          <p className="loading-state">{apiError ?? 'Nessuna sede disponibile per una nuova pratica.'}</p>
        )
      ) : (
        <div className="app">
          <Calendar
            events={filteredVisite}
            accreditationWindowStart={AC_WINDOW_START}
            accreditationWindowEnd={AC_WINDOW_END}
            // onEdit={setEditingVisita} // [Modifica nascosta nel calendario, 2026-11-24]: the edit form now opens only from "In arrivo entro 2 settimane"
            onConfirm={handleConfirm}
            onDelete={handleDelete}
            filters={filters}
            onFiltersChange={setFilters}
            teamLeaders={teamLeaders}
            ulss={ulss}
            totalCount={countVisite(visite)}
            onCreate={created ? null : () => setCreating(true)}
            focusDate={focusDate}
          />
          <aside className="sidebar">
            <div className="sidebar-actions">
              <button type="button" className="btn btn-primary" onClick={nuovaPratica}>
                + Nuova pratica
              </button>
            </div>
            {apiError && (
              <p className="api-error" role="alert">
                {apiError}
              </p>
            )}
            <div className="sidebar-fields">
              <div className="field-group expiring-box">
                <span className="field-group-label">
                  In arrivo entro 2 settimane
                  {expiring.length > 0 && <b className="expiring-count">{expiring.length}</b>}
                </span>
                {expiring.length > 0 ? (
                  <>
                    <ExpiringList items={expiring.slice(0, EXPIRING_PREVIEW)} onEdit={openFromExpiring} />
                    {expiring.length > EXPIRING_PREVIEW && (
                      <button type="button" className="btn btn-add" onClick={() => setExpiringOpen(true)}>
                        Vedi tutte le {expiring.length}
                      </button>
                    )}
                  </>
                ) : (
                  <span className="field-hint">Nessuna visita in scadenza nelle prossime 2 settimane.</span>
                )}
              </div>
              <div className="field-group">
                <span className="field-group-label">Finestra accreditamenti (AC)</span>
                <span className="campo-fixed" data-testid="ac-window">
                  {formatItDate(AC_WINDOW_START)} – {formatItDate(AC_WINDOW_END)}
                </span>
                <p className="field-hint">
                  Gli accreditamenti (AC) vanno solo in questo periodo — segnato sul calendario da una banda blu e un
                  tratteggio. Le autorizzazioni (AU) non hanno questo limite.
                </p>
              </div>
            </div>
          </aside>

          <Modal
            open={editingVisita !== null}
            onClose={() => setEditingVisita(null)}
            title={editingVisita ? `Modifica — ${editingVisita.sede}` : ''}
          >
            {editingVisita && (
              <EditVisitaForm
                key={`${editingVisita.id}:${editingVisita.congiuntaCon ?? ''}`} // fresh form state once it becomes / stops being congiunta
                visita={editingVisita}
                team={team}
                visite={visite}
                onSubmit={handleUpdateVisita}
                onCancel={() => setEditingVisita(null)}
                accreditationWindowStart={AC_WINDOW_START}
                accreditationWindowEnd={AC_WINDOW_END}
                congiuntaDeadline={editingVisita.congiuntaCon ? editingDeadline : null}
                onSplit={() => handleSplit(editingVisita.id)}
              onConfirm={() => handleConfirm(editingVisita)}
              onDelete={() => handleDelete(editingVisita)}
              />
            )}
          </Modal>

          <Modal open={expiringOpen} onClose={() => setExpiringOpen(false)} title="In arrivo entro 2 settimane">
            <ExpiringList items={expiring} onEdit={openFromExpiring} />
          </Modal>

          <Modal open={creating} onClose={() => setCreating(false)} title="Crea nuova visita">
            {creating && pratica && (
              <CreaVisitaForm
                pratica={pratica}
                team={team}
                selection={teamSel}
                visite={visite}
                accreditationWindowStart={AC_WINDOW_START}
                accreditationWindowEnd={AC_WINDOW_END}
                onSubmit={handleCreate}
                onCancel={() => setCreating(false)}
                onChangeTeam={() => {
                  setCreating(false);
                  setFase('team');
                }}
              />
            )}
          </Modal>
        </div>
      )}

      <Modal
        open={workloadOpen}
        onClose={() => setWorkloadOpen(false)}
        title="Carico di lavoro per persona"
        className="modal-wide"
      >
        {workloadLoading ? (
          <p className="loading-state">Caricamento…</p>
        ) : (
          workload && (
            <Suspense fallback={<p className="loading-state">Caricamento…</p>}>
              <WorkloadPanel rows={workload} />
            </Suspense>
          )
        )}
      </Modal>
    </div>
  );
}

export default App;
