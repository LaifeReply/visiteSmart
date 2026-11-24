import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { TeamMember } from '../lib/api';
import type { Pratica } from '../lib/pratica';
import type { TeamSelection } from '../lib/team';
import type { Visita } from '../lib/visite';
import { formatHourLabel, parseIsoDate } from '../lib/weekGrid';
import { MAX_KM } from '../lib/vincoli';
import TeamPicker, { teamErrors, teamProblems } from './TeamPicker';

const formatItDate = (iso: string) => parseIsoDate(iso).toLocaleDateString('it-IT');

interface TeamPanelProps {
  pratica: Pratica;
  team: TeamMember[];
  selection: TeamSelection;
  onChange: Dispatch<SetStateAction<TeamSelection>>;
  onConfirm: () => void;
  workloadButton: ReactNode; // the same "Carico di lavoro" button the calendar used to have
  error: string | null;
  congiungibili: Visita[]; // visits of the other tipologia at this sede the pratica can join (AU+AC), earliest first
  onJoin: (visita: Visita) => void;
  joining: boolean;
}

/** First screen: the pratica (sede + tipologia, from the process) and its team. Date and time come later. */
export default function TeamPanel({
  pratica,
  team,
  selection,
  onChange,
  onConfirm,
  workloadButton,
  error,
  congiungibili,
  onJoin,
  joining,
}: TeamPanelProps) {
  const altra = pratica.tipologia === 'AU' ? 'AC' : 'AU';
  // only the rules that don't depend on the date: distance and conflitto di interesse (no busy list = no 3 h check)
  const problems = useMemo(
    () => teamProblems(team, { ids: [], sede: pratica.sede, posizione: pratica.posizione, date: '', startHour: 0, endHour: 0 }, new Map()),
    [team, pratica],
  );
  const complete = !!selection.leaderId && selection.evaluators.some((e) => e.id !== '');
  const broken = teamErrors(team, selection, problems);

  return (
    <main className="team-screen">
      <section className="team-panel" aria-labelledby="team-panel-title">
        <header className="team-panel-head">
          <h1 id="team-panel-title">Componi il team</h1>
          {workloadButton}
        </header>

        <div className="pratica-card">
          <span className="field-group-label">Pratica</span>
          <span className="pratica-sede">
            <strong>{pratica.sede}</strong>
            <span className={`tipologia-badge tipologia-${pratica.tipologia.toLowerCase()}`}>{pratica.tipologia}</span>
          </span>
          <span className="pratica-scadenza">Scadenza {formatItDate(pratica.scadenza)}</span>
          <p className="field-hint">Sede, tipologia e scadenza arrivano dal processo (in questa demo sono estratte a caso).</p>
        </div>

        {congiungibili.length > 0 && (
          <div className="congiunta-note">
            <p>
              <strong>
                {congiungibili.length === 1
                  ? `C'è già una visita ${altra} in questa sede`
                  : `Ci sono già ${congiungibili.length} visite ${altra} in questa sede`}
              </strong>{' '}
              con cui la pratica può diventare una visita congiunta AU+AC (scadenze entro 6 mesi). La visita congiunta
              prende data, orario, team leader e valutatori della visita già in calendario.
            </p>
            <ul className="congiungibili">
              {congiungibili.map((v) => (
                <li key={v.id}>
                  <span className="congiungibile-info">
                    <strong>
                      {formatItDate(v.date)}, {formatHourLabel(v.startHour)}–{formatHourLabel(v.endHour)}
                    </strong>
                    <span>
                      TL {v.teamLeaderName || 'da assegnare'}
                      {v.evaluators.length > 0 && ` · valutatori: ${v.evaluators.map((e) => e.name).join(', ')}`}
                    </span>
                    <span>Scadenza {altra}: {formatItDate(v.scadenza!)}</span>
                  </span>
                  <button type="button" className="btn btn-congiunta" onClick={() => onJoin(v)} disabled={joining}>
                    Crea visita congiunta il {formatItDate(v.date)}
                  </button>
                </li>
              ))}
            </ul>
            <p className="field-hint">Oppure componi un nuovo team qui sotto per una visita {pratica.tipologia} separata.</p>
          </div>
        )}

        <div className="visita-form">
          <TeamPicker
            team={team}
            selection={selection}
            onChange={onChange}
            problems={problems}
            ready
            notReadyHint=""
            rules={`ULSS di riferimento entro ${MAX_KM} km dalla sede, nessun conflitto di interesse. Le 3 ore tra due visite si controllano quando scegli data e orario`}
          />
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={!complete || broken !== null}>
            Conferma
          </button>
        </div>
      </section>
    </main>
  );
}
