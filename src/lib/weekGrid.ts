export const START_HOUR = 9;
export const END_HOUR = 18; // exclusive upper bound — last slot runs END_HOUR-1 to END_HOUR

export function getHourSlots(): number[] {
  const hours: number[] = [];
  for (let h = START_HOUR; h < END_HOUR; h++) hours.push(h);
  return hours;
}

/** Valid end hours after `startHour` (or the full range if nothing is picked yet), up to END_HOUR. */
export function getEndHourOptions(startHour: number | null): number[] {
  const from = (startHour ?? START_HOUR) + 1;
  const options: number[] = [];
  for (let h = from; h <= END_HOUR; h++) options.push(h);
  return options;
}

export function formatHourLabel(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

/** Monday of the week containing `date`. */
export function getWeekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (start.getDay() + 6) % 7; // Mon=0 .. Sun=6
  start.setDate(start.getDate() - weekday);
  return start;
}

export function buildWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export const isSameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatWeekLabel(weekStart: Date, weekEnd: Date): string {
  const day = (d: Date) => d.toLocaleDateString('it-IT', { day: 'numeric' });
  const month = (d: Date) => d.toLocaleDateString('it-IT', { month: 'long' });
  const monthYear = (d: Date) => d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  const sameMonth = weekStart.getMonth() === weekEnd.getMonth() && weekStart.getFullYear() === weekEnd.getFullYear();
  if (sameMonth) return `${day(weekStart)} – ${day(weekEnd)} ${monthYear(weekEnd)}`;

  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();
  if (sameYear) return `${day(weekStart)} ${month(weekStart)} – ${day(weekEnd)} ${monthYear(weekEnd)}`;

  return `${day(weekStart)} ${monthYear(weekStart)} – ${day(weekEnd)} ${monthYear(weekEnd)}`;
}
