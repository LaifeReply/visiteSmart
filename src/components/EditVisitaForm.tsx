import { useMemo, useState, type FormEvent } from 'react';
import type { TeamMember } from '../lib/api';
import { isWithinAccreditationWindow } from '../lib/accreditationWindow';
import type { Visita } from '../lib/visite';
import type { TeamSelection } from '../lib/team';
import { busyByPerson, GAP_HOURS, MAX_KM, type Problema } from '../lib/vincoli';
import { parseIsoDate } from '../lib/weekGrid';
import SlotFields from './SlotFields';
import TeamPicker, { teamErrors, teamProblems } from './TeamPicker';

const formatItDate = (iso: string) => parseIsoDate(iso).toLocaleDateString('it-IT');

export interface EditVisitaPayload {
  date: string;
  startHour: number;
  endHour: number;
  teamLeaderId: string;
  evaluatorIds: string[];
}

interface EditVisitaFormProps {
  visita: Visita;
  team: TeamMember[];
  visite: Visita[]; // every visit: who is already busy on the chosen day (3 h rule)
  onSubmit: (payload: EditVisitaPayload) => void;
  onCancel: () => void;
  accreditationWindowStart: string;
  accreditationWindowEnd: string;
  congiuntaDeadline: string | null; // visita congiunta only: the earlier of its two expiries, a new date can't be after it
  onSplit: () => void;
  onConfirm: () => void;
  onDelete: () => void;
}

/** Date/orario/team editor for a visit that's already on the calendar — sede and tipologia stay fixed. */
export default function EditVisitaForm({
  visita,
  team,
  visite,
  onSubmit,
  onCancel,
  accreditationWindowStart,
  accreditationWindowEnd,
  congiuntaDeadline,
  onSplit,
  onConfirm,
  onDelete,
}: EditVisitaFormProps) {
  // a visita congiunta carries an AC half, so its date is bound by the accreditation window too
  const hasAC = visita.tipologia === 'AC' || visita.congiuntaCon !== null;
  const [date, setDate] = useState(visita.date);
  const [startHour, setStartHour] = useState<number | null>(visita.startHour);
  const [endHour, setEndHour] = useState<number | null>(visita.endHour);
  const [selection, setSelection] = useState<TeamSelection>({
    leaderId: visita.teamLeaderId,
    evaluators: visita.evaluators.map((e) => ({ id: e.id, campo: e.campo })),
  });
  const [error, setError] = useState<string | null>(null);

  // team constraints for the date/time currently in the form: who can't join, and why. Until a full slot is picked
  // nothing is filtered (the 3 h rule needs the hours).
  const slotReady = date !== '' && startHour !== null && endHour !== null && endHour > startHour;
  const problems = useMemo(() => {
    if (!slotReady) return new Map<string, Problema[]>();
    const slot = {
      ids: [visita.id, visita.congiuntaCon].filter((x): x is string => !!x),
      sede: visita.sede,
      posizione: visita.posizione,
      date,
      startHour: startHour!,
      endHour: endHour!,
    };
    return teamProblems(team, slot, busyByPerson(visite, date));
  }, [slotReady, visita, visite, team, date, startHour, endHour]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!date) return setError('Seleziona la data della visita.');
    if ([0, 6].includes(parseIsoDate(date).getDay())) return setError('Le visite si fanno dal lunedì al venerdì.');
    // only when the date moves: a congiunta already past its expiry must still be able to get its team
    if (congiuntaDeadline && date !== visita.date && date > congiuntaDeadline) {
      return setError(`La visita congiunta va fatta entro la prima scadenza, il ${formatItDate(congiuntaDeadline)}.`);
    }
    if (
      hasAC &&
      accreditationWindowStart &&
      accreditationWindowEnd &&
      !isWithinAccreditationWindow(date, accreditationWindowStart, accreditationWindowEnd)
    ) {
      return setError(
        `Gli accreditamenti vanno programmati tra il ${formatItDate(accreditationWindowStart)} e il ${formatItDate(accreditationWindowEnd)}.`,
      );
    }
    if (startHour === null) return setError("Seleziona l'ora di inizio.");
    if (endHour === null) return setError("Seleziona l'ora di fine.");
    if (endHour <= startHour) return setError("L'ora di fine deve essere dopo l'ora di inizio.");
    if (!selection.leaderId) return setError('Seleziona il team leader.');
    const evaluatorIds = selection.evaluators.filter((e) => e.id !== '').map((e) => e.id);
    if (evaluatorIds.length === 0) return setError('Il team minimo è un team leader e un valutatore.');
    const broken = teamErrors(team, selection, problems);
    if (broken) return setError(broken);

    setError(null);
    onSubmit({
      date,
      startHour,
      endHour,
      teamLeaderId: selection.leaderId,
      evaluatorIds,
    });
  };

  return (
    <form className="visita-form" onSubmit={handleSubmit}>
      <p className="field-hint">
        {visita.sede} —{' '}
        {visita.congiuntaCon ? (
          <span className="tipologia-badge tipologia-congiunta">AU+AC</span>
        ) : (
          <span className={`tipologia-badge tipologia-${visita.tipologia.toLowerCase()}`}>{visita.tipologia}</span>
        )}
      </p>

      {visita.congiuntaCon && (
        <div className="congiunta-note">
          <p>
            <strong>Visita congiunta AU + AC.</strong> Le modifiche valgono per entrambe le visite.
          </p>
          <button type="button" className="btn" onClick={onSplit}>
            Separa AU e AC
          </button>
        </div>
      )}

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
          <>
            {hasAC && accreditationWindowStart && accreditationWindowEnd && (
              <p className="field-hint">
                Accreditamenti consentiti dal {formatItDate(accreditationWindowStart)} al {formatItDate(accreditationWindowEnd)}.
              </p>
            )}
            {congiuntaDeadline && <p className="field-hint">Visita congiunta: entro il {formatItDate(congiuntaDeadline)}.</p>}
          </>
        }
      />

      <TeamPicker
        team={team}
        selection={selection}
        onChange={setSelection}
        problems={problems}
        ready={slotReady}
        notReadyHint="Scegli data e orario per vedere chi è disponibile."
        rules={`ULSS di riferimento entro ${MAX_KM} km dalla sede, nessun conflitto di interesse, almeno ${GAP_HOURS} ore tra due visite nello stesso giorno`}
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-elimina" onClick={onDelete}>
          Elimina
        </button>
        {visita.confermata ? (
          <span className="stato-confermata">Confermata</span>
        ) : (
          <button type="button" className="btn btn-conferma" onClick={onConfirm}>
            Conferma
          </button>
        )}
        <span className="form-actions-spacer" />
        <button type="button" className="btn" onClick={onCancel}>
          Annulla
        </button>
        <button type="submit" className="btn btn-primary">
          Salva modifiche
        </button>
      </div>
    </form>
  );
}
