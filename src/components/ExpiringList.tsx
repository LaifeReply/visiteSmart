import type { Expiring } from '../lib/scadenze';
import type { Visita } from '../lib/visite';
import { parseIsoDate } from '../lib/weekGrid';

const formatItDate = (iso: string) => parseIsoDate(iso).toLocaleDateString('it-IT');
const giorni = (n: number) => `${n} ${n === 1 ? 'giorno' : 'giorni'}`;

function when(g: number): string {
  if (g < 0) return `Scaduta da ${giorni(-g)}`;
  if (g === 0) return 'Scade oggi';
  return `Scade tra ${giorni(g)}`;
}

interface ExpiringListProps {
  items: Expiring[];
  onEdit: (visita: Visita) => void;
}

/** Visits whose expiry is close (or past): each row opens "Modifica". */
export default function ExpiringList({ items, onEdit }: ExpiringListProps) {
  return (
    <ul className="expiring-list">
      {items.map(({ visita, giorni: g }) => {
        return (
          <li key={visita.id}>
            <button type="button" className="expiring-row" onClick={() => onEdit(visita)}>
              <span className="expiring-head">
                {visita.congiuntaCon ? (
                  <span className="tipologia-badge tipologia-congiunta">AU+AC</span>
                ) : (
                  <span className={`tipologia-badge tipologia-${visita.tipologia.toLowerCase()}`}>{visita.tipologia}</span>
                )}
                <strong>{visita.sede}</strong>
              </span>
              <span className={`expiring-when${g < 0 ? ' is-overdue' : ''}`}>
                {when(g)}, il {formatItDate(visita.scadenza!)}
              </span>
              <span className="expiring-detail">
                Visita il {formatItDate(visita.date)}
                {visita.date > visita.scadenza! && ', dopo la scadenza'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
