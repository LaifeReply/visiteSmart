export interface TimedEvent {
  id: string;
  startHour: number;
  endHour: number;
}

/** A crowded day split by start hour: one group per hour that has visits, earliest first. */
export function groupByStartHour<T extends TimedEvent>(events: T[]): { hour: number; events: T[] }[] {
  const byHour = new Map<number, T[]>();
  for (const e of events) {
    const list = byHour.get(e.startHour);
    if (list) list.push(e);
    else byHour.set(e.startHour, [e]);
  }
  return [...byHour].sort(([a], [b]) => a - b).map(([hour, list]) => ({ hour, events: list }));
}

export interface LaidOutEvent<T extends TimedEvent> {
  event: T;
  column: number;
  columnCount: number;
}

/**
 * Lays out same-day events into side-by-side columns so overlapping ones never cover each other.
 * Transitively-overlapping events share one cluster and get equal-width columns within it;
 * non-overlapping events fall back into column 0 (full width, stacked one after another).
 */
export function layoutDayEvents<T extends TimedEvent>(events: T[]): LaidOutEvent<T>[] {
  const sorted = [...events].sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);

  const clusters: T[][] = [];
  let clusterEnd = -Infinity;
  for (const event of sorted) {
    if (clusters.length > 0 && event.startHour < clusterEnd) {
      clusters[clusters.length - 1].push(event);
    } else {
      clusters.push([event]);
      clusterEnd = -Infinity;
    }
    clusterEnd = Math.max(clusterEnd, event.endHour);
  }

  const result: LaidOutEvent<T>[] = [];
  for (const cluster of clusters) {
    const columns: T[][] = [];
    const columnById = new Map<string, number>();
    for (const event of cluster) {
      let column = columns.findIndex((col) => col[col.length - 1].endHour <= event.startHour);
      if (column === -1) {
        columns.push([event]);
        column = columns.length - 1;
      } else {
        columns[column].push(event);
      }
      columnById.set(event.id, column);
    }
    for (const event of cluster) {
      result.push({ event, column: columnById.get(event.id)!, columnCount: columns.length });
    }
  }

  return result;
}
