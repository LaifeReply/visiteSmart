import { m } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { isWithinAccreditationWindow } from '../lib/accreditationWindow';
import { groupByStartHour, layoutDayEvents } from '../lib/eventLayout';
import { countVisite, type UlssCenter, type Visita, type VisitaFilters } from '../lib/visite';
import {
  buildWeekDays,
  formatHourLabel,
  formatWeekLabel,
  getHourSlots,
  getWeekStart,
  isSameDay,
  parseIsoDate,
  toIsoDate,
} from '../lib/weekGrid';
import CalendarFilters from './CalendarFilters';
import DayAgenda from './DayAgenda';
import Modal from './Modal';

// visits only happen Monday to Friday (Sat/Sun are rejected on save), so the grid shows the working week only
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven'];

// Past this many events, side-by-side columns degrade into unreadable slivers (each one
// a sub-10px-wide bar) — collapse into one "N visite" card per start hour, each in its own
// hour row, that opens the day-zoom (DayAgenda) for that hour.
const DENSE_DAY_THRESHOLD = 6;

/** AU / AC / congiunta counts of a group of visits (the AC half of a congiunta is never in the list, see eventsByDate). */
function tipologiaCounts(list: Visita[]) {
  const joint = list.filter((e) => e.congiuntaCon).length;
  const ac = list.filter((e) => e.tipologia === 'AC' && !e.congiuntaCon).length;
  return { au: list.length - ac - joint, ac, joint };
}

interface CalendarProps {
  events: Visita[];
  accreditationWindowStart: string;
  accreditationWindowEnd: string;
  // [Modifica nascosta nel calendario, 2026-11-24] the edit form is no longer reachable from the calendar
  // onEdit: (visita: Visita) => void;
  onConfirm: (visita: Visita) => void;
  onDelete: (visita: Visita) => void;
  filters: VisitaFilters;
  onFiltersChange: (filters: VisitaFilters) => void;
  teamLeaders: { id: string; name: string }[];
  ulss: UlssCenter[];
  totalCount: number; // visits before filtering, for the "N di M" counter (events is already filtered)
  onCreate: (() => void) | null; // "Crea nuova visita"; null once the pratica's visit exists (button hidden)
  focusDate: string | null; // a just-created visit: its week is brought into view
}

function formatDayTitle(day: Date): string {
  const label = day.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function Calendar({
  events,
  accreditationWindowStart,
  accreditationWindowEnd,
  // onEdit, // [Modifica nascosta nel calendario, 2026-11-24]
  onConfirm,
  onDelete,
  filters,
  onFiltersChange,
  teamLeaders,
  ulss,
  totalCount,
  onCreate,
  focusDate,
}: CalendarProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  // the day being zoomed into; hour set = only the visits starting at that hour (clicked from an hour card)
  const [zoom, setZoom] = useState<{ date: Date; hour: number | null } | null>(null);
  const setZoomDate = (date: Date, hour: number | null = null) => setZoom({ date, hour });
  const [direction, setDirection] = useState(0); // -1 prev week, 1 next week: which side the grid slides in from

  const weekDays = useMemo(() => buildWeekDays(weekStart).slice(0, WEEKDAYS.length), [weekStart]);
  const hours = useMemo(() => getHourSlots(), []);
  const today = useMemo(() => new Date(), []);

  const weekLabel = formatWeekLabel(weekStart, weekDays[weekDays.length - 1]);
  const slotKey = (day: Date, hour: number) => `${day.toDateString()}_${hour}`;
  // grouped once per events change: a render (e.g. a slot click) no longer rescans every visit for each of the 7 days
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Visita[]>();
    for (const event of events) {
      // a visita congiunta is one visit on site: its AU half stands for both, the AC half is not drawn again
      if (event.tipologia === 'AC' && event.congiuntaCon) continue;
      const list = map.get(event.date);
      if (list) list.push(event);
      else map.set(event.date, [event]);
    }
    return map;
  }, [events]);
  const eventsForDay = (day: Date) => eventsByDate.get(toIsoDate(day)) ?? [];
  const isInAccreditationWindow = (day: Date) =>
    isWithinAccreditationWindow(toIsoDate(day), accreditationWindowStart, accreditationWindowEnd);

  const showWeekOf = (day: Date) => {
    const target = getWeekStart(day);
    setDirection(Math.sign(target.getTime() - weekStart.getTime()));
    setWeekStart(target);
  };

  useEffect(() => {
    if (focusDate) setWeekStart(getWeekStart(parseIsoDate(focusDate)));
  }, [focusDate]);

  const goToWeek = (delta: number) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + delta * 7);
    setDirection(delta);
    setWeekStart(next);
  };

  return (
    <div className="calendar">
      <div className="calendar-header">
        <div className="calendar-title">
          <h1>{weekLabel}</h1>
        </div>
        <div className="calendar-nav">
          {onCreate && (
            <button type="button" className="btn btn-primary btn-create" onClick={onCreate}>
              Crea nuova visita
            </button>
          )}
          <button type="button" className="nav-btn" onClick={() => goToWeek(-1)} aria-label="Settimana precedente">
            ‹
          </button>
          <button
            type="button"
            className="nav-btn nav-btn-today"
            onClick={() => showWeekOf(new Date())}
          >
            Oggi
          </button>
          <button type="button" className="nav-btn" onClick={() => goToWeek(1)} aria-label="Settimana successiva">
            ›
          </button>
        </div>
      </div>

      <CalendarFilters
        filters={filters}
        onChange={(next) => {
          // picking a date also brings its week into view, or the filtered visits would be off screen
          if (next.date && next.date !== filters.date) showWeekOf(parseIsoDate(next.date));
          onFiltersChange(next);
        }}
        teamLeaders={teamLeaders}
        ulss={ulss}
        shown={countVisite(events)}
        total={totalCount}
      />

      <m.div
        key={toIsoDate(weekStart)}
        className="week-grid"
        initial={{ opacity: 0, x: direction * 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <div className="corner" />
        {weekDays.map((day, dayIndex) => (
          <button
            type="button"
            key={day.toDateString()}
            className={`day-header${isSameDay(day, today) ? ' is-today' : ''}${isInAccreditationWindow(day) ? ' is-ac-window' : ''}`}
            onClick={() => setZoomDate(day)}
            aria-label={`Ingrandisci ${WEEKDAYS[dayIndex]} ${day.getDate()}`}
          >
            <span className="day-header-name">{WEEKDAYS[dayIndex]}</span>
            <span className="day-header-num">{day.getDate()}</span>
          </button>
        ))}

        <div className="hour-rail">
          {hours.map((hour) => (
            <div className="hour-label" key={hour}>
              {formatHourLabel(hour)}
            </div>
          ))}
        </div>

        {weekDays.map((day, dayIndex) => {
          const dayEvents = eventsForDay(day);
          const isDense = dayEvents.length > DENSE_DAY_THRESHOLD;
          const laidOut = isDense ? [] : layoutDayEvents(dayEvents);
          return (
            <div className={`day-body${isInAccreditationWindow(day) ? ' is-ac-window' : ''}`} key={day.toDateString()}>
              {hours.map((hour) => {
                const key = slotKey(day, hour);
                const isSelected = selected === key;
                return (
                  <button
                    type="button"
                    key={hour}
                    className={`slot${isSelected ? ' is-selected' : ''}`}
                    onClick={() => setSelected(isSelected ? null : key)}
                    aria-label={`${WEEKDAYS[dayIndex]} ${day.getDate()} ${formatHourLabel(hour)}`}
                  />
                );
              })}

              {isDense ? (
                groupByStartHour(dayEvents).map(({ hour, events: group }) => {
                  const { au, ac, joint } = tipologiaCounts(group);
                  const label = `${group.length} ${group.length === 1 ? 'visita' : 'visite'} alle ${formatHourLabel(hour)}: ${au} AU, ${ac} AC${joint ? `, ${joint} congiunte` : ''}`;
                  return (
                    <button
                      type="button"
                      key={hour}
                      className="hour-cluster"
                      style={{
                        // one hour row, with a 2px gap above and below so stacked cards stay apart
                        top: `calc(${((hour - hours[0]) / hours.length) * 100}% + 2px)`,
                        height: `calc(${(1 / hours.length) * 100}% - 4px)`,
                      }}
                      onClick={() => setZoomDate(day, hour)}
                      title={label}
                      aria-label={`${WEEKDAYS[dayIndex]} ${day.getDate()}, ${label}`}
                    >
                      <span className="hour-cluster-count">
                        <strong>{group.length}</strong> {group.length === 1 ? 'visita' : 'visite'}
                      </span>
                      <span className="dense-split" aria-hidden="true">
                        <i className="dense-au" style={{ flexGrow: au }} />
                        <i className="dense-ac" style={{ flexGrow: ac }} />
                        {joint > 0 && <i className="dense-congiunta" style={{ flexGrow: joint }} />}
                      </span>
                    </button>
                  );
                })
              ) : (
                laidOut.map(({ event, column, columnCount }) => (
                  <m.button
                    type="button"
                    key={event.id}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: dayIndex * 0.02 }}
                    className={`event-block tipologia-${event.congiuntaCon ? 'congiunta' : event.tipologia.toLowerCase()}${event.confermata ? ' is-confermata' : ''}`}
                    style={{
                      top: `${((event.startHour - hours[0]) / hours.length) * 100}%`,
                      height: `${((event.endHour - event.startHour) / hours.length) * 100}%`,
                      left: `calc(${(column / columnCount) * 100}% + 2px)`,
                      width: `calc(${(100 / columnCount)}% - 4px)`,
                    }}
                    onClick={() => setZoomDate(day)}
                  >
                    <strong>
                      {event.confermata && <span aria-label="Confermata">✓ </span>}
                      {event.sede}
                    </strong>
                    <span>
                      {event.congiuntaCon && 'AU+AC, '}
                      {formatHourLabel(event.startHour)}–{formatHourLabel(event.endHour)}
                    </span>
                  </m.button>
                ))
              )}
            </div>
          );
        })}
      </m.div>

      <Modal
        open={zoom !== null}
        onClose={() => setZoom(null)}
        title={zoom ? formatDayTitle(zoom.date) + (zoom.hour === null ? '' : `, dalle ${formatHourLabel(zoom.hour)}`) : ''}
      >
        {zoom && (
          <DayAgenda
            visite={eventsForDay(zoom.date).filter((e) => zoom.hour === null || e.startHour === zoom.hour)}
            // onEdit={onEdit} // [Modifica nascosta nel calendario, 2026-11-24]
            onConfirm={onConfirm}
            onDelete={onDelete}
          />
        )}
      </Modal>
    </div>
  );
}
