export type Campo = 'SS' | 'SA';

/** A single evaluator slot while building up a selection in a form — just id + campo, no name (that's looked up for display, not carried here). */
export interface EvaluatorSlot {
  id: string;
  campo: Campo | null;
}

export interface TeamSelection {
  leaderId: string | null;
  evaluators: EvaluatorSlot[];
}

/** Assigns `id` as team leader (or clears it, for `null`). Roles don't overlap, so it drops them from the evaluators. */
export function assignLeader(selection: TeamSelection, id: string | null): TeamSelection {
  if (id === null) return { ...selection, leaderId: null };
  return { ...selection, leaderId: id, evaluators: selection.evaluators.filter((e) => e.id !== id) };
}

/** Appends an empty evaluator slot, to be filled in with setEvaluatorAt. */
export function addEvaluatorSlot(selection: TeamSelection): TeamSelection {
  return { ...selection, evaluators: [...selection.evaluators, { id: '', campo: null }] };
}

/** Removes the evaluator slot at `index`. */
export function removeEvaluatorSlot(selection: TeamSelection, index: number): TeamSelection {
  return { ...selection, evaluators: selection.evaluators.filter((_, i) => i !== index) };
}

/** Sets the person at `index`. Roles don't overlap, so picking the team leader is a no-op. */
export function setEvaluatorAt(selection: TeamSelection, index: number, id: string): TeamSelection {
  if (id !== '' && id === selection.leaderId) return selection;
  return { ...selection, evaluators: selection.evaluators.map((e, i) => (i === index ? { ...e, id } : e)) };
}
