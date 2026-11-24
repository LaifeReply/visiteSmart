import { useMemo, useState, type FormEvent } from 'react';
import type { TeamMember } from '../lib/api';
import { isWithinAccreditationWindow } from '../lib/accreditationWindow';
import type { Pratica } from '../lib/pratica';
import type { TeamSelection } from '../lib/team';
import { busyByPerson, type Problema } from '../lib/vincoli';
import type { Visita } from '../lib/visite';
import { parseIsoDate } from '../lib/weekGrid';
import SlotFields from './SlotFields';
import { teamErrors, teamProblems } from './TeamPicker';

const formatItDate = (iso: string) => parseIsoDate(iso).toLocaleDateString('it-IT');

export interface CreaVisitaSlot {
  date: string;
  startHour: number;
  endHour: number;
}

interface CreaVisitaFormProps {
  pratica: Pratica;
  team: TeamMember[];
  selection: TeamSelection; // composed on the first screen, read-only here
  visite: Visita[]; // who is already busy on the chosen day (3 h rule)
  accreditationWindowStart: string;
  accreditationWindowEnd: string;
  onSubmit: (slot: CreaVisitaSlot) => Promise<string | null>; // resolves to the server's error, null when saved
  onCancel: () => void;
  onChangeTeam: () => void;
}

/** Date and time for the pratica's new visit; the team comes from the first screen and must pass every constraint. */
export default function CreaVisitaForm({
  pratica,
  team,
  selection,
  visite,
  accreditationWindowStart,
  accreditationWindowEnd,
  onSubmit,
  onCancel,
  onChangeTeam,
}: CreaVisitaFormProps) {
  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState<number | null>(null);
  const [endHour, setEndHour] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameOf = (id: string) => team.find((m) => m.id === id);
  const leader = selection.leaderId ? nameOf(selection.leaderId) : undefined;
  const evaluators = selection.evaluators.map((e) => nameOf(e.id)).filter((m): m is TeamMember => !!m);

  const slotReady = date !== '' && startHour !== null && endHour !== null && endHour > startHour;
  const problems = useMemo(() => {
    if (!slotReady) return new Map<string, Problema[]>();
    const slot = { ids: [], sede: pratica.sede, posizione: pratica.posizione, date, startHour: startHour!, endHour: endHour! };
    return teamProblems(team, slot, busyByPerson(visite, date));
  }, [slotReady, pratica, team, visite, date, startHour, endHour]);
  const why = (id: string) => problems.get(id)?.map((p) => p.testo).join('; ');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!date) return setError('Seleziona la data della visita.');
    if ([0, 6].includes(parseIsoDate(date).getDay())) return setError('Le visite si fanno dal lunedì al venerdì.');
    if (pratica.tipologia === 'AC' && !isWithinAccreditationWindow(date, accreditationWindowStart, accreditationWindowEnd)) {
      return setError(
        `Gli accreditamenti vanno programmati tra il ${formatItDate(accreditationWindowStart)} e il ${formatItDate(accreditationWindowEnd)}.`,
      );
    }
    if (startHour === null) return setError("Seleziona l'ora di inizio.");
    if (endHour === null) return setError("Seleziona l'ora di fine.");
    if (endHour <= startHour) return setError("L'ora di fine deve essere dopo l'ora di inizio.");
    const broken = teamErrors(team, selection, problems);
    if (broken) return setError(broken);

    setError(null);
    setSaving(true);
    const serverError = await onSubmit({ date, startHour, endHour });
    setSaving(false);
    if (serverError) setError(serverError);
  };

  const member = (m: TeamMember, role: string) => (
    <li key={m.id}>
      <span className="team-summary-role">{role}</span>
      <strong>{m.name}</strong>
      {m.esterno && <span className="esterno-flag esterno-inline">Esterno</span>}
      {problems.has(m.id) && <p className="vincolo-error">Non può partecipare: {why(m.id)}.</p>}
    </li>
  );

  return (
    <form className="visita-form" onSubmit={handleSubmit}>
      <p className="field-hint">
        {pratica.sede} — <span className={`tipologia-badge tipologia-${pratica.tipologia.toLowerCase()}`}>{pratica.tipologia}</span>
      </p>

      <div className="field-group">
        <span className="field-group-label">Team</span>
        <ul className="team-summary">
          {leader && member(leader, 'Team leader')}
          {evaluators.map((m) => member(m, 'Valutatore'))}
        </ul>
        <button type="button" className="btn btn-link" onClick={onChangeTeam}>
          Cambia team
        </button>
      </div>

      <SlotFields
        date={date}
        startHour={startHour}
        endHour={endHour}
        onDate={setDate}
        onHours={(start, end) => {
          setStartHour(start);
          setEndHour(end);
        }}
        dateHints={
          pratica.tipologia === 'AC' && (
            <p className="field-hint">
              Accreditamenti consentiti dal {formatItDate(accreditationWindowStart)} al {formatItDate(accreditationWindowEnd)}.
            </p>
          )
        }
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Annulla
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Crea visita
        </button>
      </div>
    </form>
  );
}
