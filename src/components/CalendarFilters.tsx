import { hasActiveFilters, NO_FILTERS, type UlssCenter, type VisitaFilters } from '../lib/visite';
import { formatHourLabel, getEndHourOptions, getHourSlots } from '../lib/weekGrid';

interface CalendarFiltersProps {
  filters: VisitaFilters;
  onChange: (filters: VisitaFilters) => void;
  teamLeaders: { id: string; name: string }[];
  ulss: UlssCenter[];
  shown: number;
  total: number;
}

const fmtCount = (n: number) => n.toLocaleString('it-IT');

/** Filter bar above the week grid: sede, ULSS, team leader, date, time range. An active chip is tinted so it's clear what is narrowing the view. */
export default function CalendarFilters({ filters, onChange, teamLeaders, ulss, shown, total }: CalendarFiltersProps) {
  const set = (patch: Partial<VisitaFilters>) => onChange({ ...filters, ...patch });
  const active = hasActiveFilters(filters);

  const handleFromChange = (value: string) => {
    const fromHour = value ? Number(value) : null;
    // drop an end that's no longer after the new start
    const toHour = fromHour !== null && filters.toHour !== null && filters.toHour <= fromHour ? null : filters.toHour;
    set({ fromHour, toHour });
  };

  const chip = (isActive: boolean) => `filter-chip${isActive ? ' is-active' : ''}`;

  return (
    <div className="calendar-filters">
      {/* one row of form cells (label above value), like the fields of a printed modulo */}
      <div className="filter-rail">
        <label className={chip(filters.sede.trim() !== '') + ' filter-sede'}>
          <span className="filter-label">Sede</span>
          <span className="filter-value">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={filters.sede}
              onChange={(e) => set({ sede: e.target.value })}
              placeholder="Cerca per nome…"
            />
          </span>
        </label>

        <label className={chip(filters.ulssId !== null) + ' filter-ulss'}>
          <span className="filter-label">ULSS</span>
          <select value={filters.ulssId ?? ''} onChange={(e) => set({ ulssId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Tutte</option>
            {ulss.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>

        <label className={chip(filters.teamLeaderId !== '') + ' filter-leader'}>
          <span className="filter-label">Team leader</span>
          <select value={filters.teamLeaderId} onChange={(e) => set({ teamLeaderId: e.target.value })}>
            <option value="">Tutti</option>
            {teamLeaders.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className={chip(filters.date !== '') + ' filter-data'}>
          <span className="filter-label">Data</span>
          <input type="date" value={filters.date} onChange={(e) => set({ date: e.target.value })} />
        </label>

        <div className={chip(filters.fromHour !== null || filters.toHour !== null) + ' filter-orario'} role="group" aria-labelledby="filter-orario">
          <span className="filter-label" id="filter-orario">
            Orario
          </span>
          <span className="filter-value">
            <select value={filters.fromHour ?? ''} onChange={(e) => handleFromChange(e.target.value)} aria-label="Dalle ore">
              <option value="">dalle</option>
              {getHourSlots().map((h) => (
                <option key={h} value={h}>
                  {formatHourLabel(h)}
                </option>
              ))}
            </select>
            <span aria-hidden="true">–</span>
            <select
              value={filters.toHour ?? ''}
              onChange={(e) => set({ toHour: e.target.value ? Number(e.target.value) : null })}
              aria-label="Alle ore"
            >
              <option value="">alle</option>
              {getEndHourOptions(filters.fromHour).map((h) => (
                <option key={h} value={h}>
                  {formatHourLabel(h)}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      <div className="filter-summary">
        <span className="filter-count" aria-live="polite">
          {active ? (
            <>
              <strong>{fmtCount(shown)}</strong> di {fmtCount(total)} visite
            </>
          ) : (
            <>
              <strong>{fmtCount(total)}</strong> visite
            </>
          )}
        </span>
        {/* always in the layout (hidden + disabled when idle) so showing it never shifts the filter row */}
        <button
          type="button"
          className="filter-clear"
          onClick={() => onChange(NO_FILTERS)}
          disabled={!active}
          style={{ visibility: active ? 'visible' : 'hidden' }}
        >
          Azzera filtri
        </button>
      </div>
    </div>
  );
}
