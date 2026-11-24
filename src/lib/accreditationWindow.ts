// Fixed AC period (inclusive, yyyy-mm-dd): not editable in the UI.
// ponytail: hardcoded to 2026, bump the year (or derive it) when the next accreditation season is set.
export const AC_WINDOW_START = '2026-08-01';
export const AC_WINDOW_END = '2026-12-01';

/**
 * Whether `dayISO` falls within [startISO, endISO] inclusive.
 * Unset bounds (either one empty) mean no restriction has been configured yet.
 * Plain yyyy-mm-dd strings compare correctly as lexical order == chronological order.
 */
export function isWithinAccreditationWindow(dayISO: string, startISO: string, endISO: string): boolean {
  if (!startISO || !endISO) return false;
  return dayISO >= startISO && dayISO <= endISO;
}
