import type { ReactNode } from 'react';
import { formatHourLabel, getEndHourOptions, getHourSlots } from '../lib/weekGrid';

const todayISO = () => new Date().toISOString().slice(0, 10);

interface SlotFieldsProps {
  date: string;
  startHour: number | null;
  endHour: number | null;
  onDate: (date: string) => void;
  onHours: (startHour: number | null, endHour: number | null) => void;
  dateHints?: ReactNode; // limits that apply to this visit, shown under the date
}

/** Data + ora inizio / ora fine of a visit. Moving the start past the end clears the end. */
export default function SlotFields({ date, startHour, endHour, onDate, onHours, dateHints }: SlotFieldsProps) {
  const handleStartChange = (value: string) => {
    const next = value ? Number(value) : null;
    onHours(next, endHour !== null && next !== null && endHour <= next ? null : endHour);
  };

  return (
    <>
      <label className="field">
        <span>Data</span>
        <input type="date" value={date} min={todayISO()} onChange={(e) => onDate(e.target.value)} />
        {dateHints}
      </label>

      <div className="field-group">
        <span className="field-group-label">Orario</span>
        <div className="time-range">
          <label className="field">
            <span>Ora inizio</span>
            <select value={startHour ?? ''} onChange={(e) => handleStartChange(e.target.value)}>
              <option value="">Seleziona…</option>
              {getHourSlots().map((h) => (
                <option key={h} value={h}>
                  {formatHourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Ora fine</span>
            <select value={endHour ?? ''} onChange={(e) => onHours(startHour, e.target.value ? Number(e.target.value) : null)}>
              <option value="">Seleziona…</option>
              {getEndHourOptions(startHour).map((h) => (
                <option key={h} value={h}>
                  {formatHourLabel(h)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </>
  );
}
