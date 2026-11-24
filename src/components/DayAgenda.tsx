import { m } from 'motion/react';
import type { Visita } from '../lib/visite';
import { formatHourLabel } from '../lib/weekGrid';

interface DayAgendaProps {
  visite: Visita[];
  // [Modifica nascosta nel calendario, 2026-11-24] the agenda no longer opens the edit form; uncomment here, below and in Calendar/App to bring it back
  // onEdit: (visita: Visita) => void;
  onConfirm: (visita: Visita) => void;
  onDelete: (visita: Visita) => void;
}

/** Clear, ordered list of a single day's visits — the "zoom in" view for when the week grid gets crowded. */
export default function DayAgenda({ visite, /* onEdit, */ onConfirm, onDelete }: DayAgendaProps) {
  if (visite.length === 0) {
    return <p className="day-agenda-empty">Nessuna visita in programma per questo giorno.</p>;
  }

  const sorted = [...visite].sort((a, b) => a.startHour - b.startHour);

  return (
    <ul className="day-agenda">
      {sorted.map((visita, i) => (
        <m.li
          key={visita.id}
          className="agenda-item"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: Math.min(i, 10) * 0.03 }}
        >
          <div className="agenda-time">
            {formatHourLabel(visita.startHour)}
            <br />
            {formatHourLabel(visita.endHour)}
          </div>
          <div className="agenda-body">
            <div className="agenda-heading">
              {visita.congiuntaCon ? (
                <span className="tipologia-badge tipologia-congiunta">AU+AC</span>
              ) : (
                <span className={`tipologia-badge tipologia-${visita.tipologia.toLowerCase()}`}>{visita.tipologia}</span>
              )}
              <strong>{visita.sede}</strong>
              {visita.confermata && <span className="stato-confermata">Confermata</span>}
            </div>
            <p>Team leader: {visita.teamLeaderName || 'da assegnare'}</p>
            {visita.evaluators.length > 0 && (
              <p>Valutatori: {visita.evaluators.map((e) => e.name).join(', ')}</p>
            )}
            <span className="agenda-actions">
              {!visita.confermata && (
                <button type="button" className="btn-edit btn-conferma" onClick={() => onConfirm(visita)}>
                  Conferma
                </button>
              )}
              {/* [Modifica nascosta nel calendario, 2026-11-24]
              <button type="button" className="btn-edit" onClick={() => onEdit(visita)}>
                Modifica
              </button>
              */}
              <button type="button" className="btn-edit btn-elimina" onClick={() => onDelete(visita)}>
                Elimina
              </button>
            </span>
          </div>
        </m.li>
      ))}
    </ul>
  );
}
