import type { Dispatch, SetStateAction } from 'react';
import type { TeamMember } from '../lib/api';
import { addEvaluatorSlot, assignLeader, removeEvaluatorSlot, setEvaluatorAt, type TeamSelection } from '../lib/team';
import { MAX_KM, problemi, type Busy, type Motivo, type Problema, type Slot } from '../lib/vincoli';

/** Who can't join a team for `slot`, and why. `busy` = each person's other visits that day (empty map = skip the 3 h rule). */
export function teamProblems(team: TeamMember[], slot: Slot, busy: Map<string, Busy[]>): Map<string, Problema[]> {
  const out = new Map<string, Problema[]>();
  for (const p of team) {
    const list = problemi(p, slot, busy.get(p.id) ?? []);
    if (list.length) out.set(p.id, list);
  }
  return out;
}

/** "Mario Rossi: oltre 50 km. …" for every chosen person who breaks a rule; null when the team is fine. */
export function teamErrors(team: TeamMember[], selection: TeamSelection, problems: Map<string, Problema[]>): string | null {
  const ids = [selection.leaderId, ...selection.evaluators.map((e) => e.id)].filter((id): id is string => !!id);
  const broken = ids.filter((id) => problems.has(id));
  if (broken.length === 0) return null;
  const nameOf = (id: string) => team.find((m) => m.id === id)?.name ?? id;
  return broken.map((id) => `${nameOf(id)}: ${problems.get(id)!.map((p) => p.testo).join('; ')}.`).join(' ');
}

interface TeamPickerProps {
  team: TeamMember[];
  selection: TeamSelection;
  onChange: Dispatch<SetStateAction<TeamSelection>>;
  problems: Map<string, Problema[]>;
  ready: boolean; // false = the slot isn't known yet, so nobody is filtered
  notReadyHint: string;
  rules: string; // which constraints `problems` covers, for the hint above the evaluators
}

/** Team leader + evaluator menus: they offer only who passes the constraints and explain who was left out and why. */
export default function TeamPicker({ team, selection, onChange, problems, ready, notReadyHint, rules }: TeamPickerProps) {
  const canJoin = (id: string) => !problems.has(id);
  const why = (id: string) => problems.get(id)?.map((p) => p.testo).join('; ');
  // the person already chosen stays in its own menu even when it breaks a rule, so the select can show it (flagged)
  const leaderOptions = team.filter((m) => m.canLead && (canJoin(m.id) || m.id === selection.leaderId));
  const excluded = (pool: TeamMember[]) => {
    const by: Record<Motivo, number> = { distanza: 0, conflitto: 0, orario: 0 };
    let n = 0;
    for (const m of pool) {
      const list = problems.get(m.id);
      if (!list) continue;
      n++;
      for (const p of list) by[p.motivo]++;
    }
    if (n === 0) return null;
    const parts = [
      by.distanza && `${by.distanza} oltre ${MAX_KM} km`,
      by.conflitto && `${by.conflitto} per conflitto di interesse`,
      by.orario && `${by.orario} per altre visite troppo vicine`,
    ].filter(Boolean);
    return `${n} ${n === 1 ? 'esclusa' : 'escluse'} dai vincoli: ${parts.join(', ')}.`;
  };

  return (
    <>
      <label className="field">
        <span>Team leader</span>
        <select value={selection.leaderId ?? ''} onChange={(e) => onChange((t) => assignLeader(t, e.target.value || null))}>
          <option value="">Seleziona…</option>
          {leaderOptions.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        {selection.leaderId && !canJoin(selection.leaderId) && (
          <p className="vincolo-error">Non può guidare questa visita: {why(selection.leaderId)}.</p>
        )}
        {ready && <p className="field-hint">Proposti solo i team leader che rispettano i vincoli. {excluded(team.filter((m) => m.canLead))}</p>}
      </label>

      <div className="field-group">
        <span className="field-group-label">Valutatori (almeno uno)</span>
        <p className="field-hint">
          {ready ? `Proposte solo le persone che rispettano i vincoli: ${rules}. ${excluded(team) ?? ''}` : notReadyHint}
        </p>

        {selection.evaluators.length > 0 && (
          <div className="evaluator-list">
            {selection.evaluators.map((assignment, index) => {
              const pickedElsewhere = selection.evaluators.filter((_, i) => i !== index).map((e) => e.id);
              const options = team.filter(
                (member) =>
                  member.id !== selection.leaderId &&
                  !pickedElsewhere.includes(member.id) &&
                  (canJoin(member.id) || member.id === assignment.id),
              );
              const esterno = team.find((m) => m.id === assignment.id)?.esterno ?? false;
              return (
                <div key={index}>
                  <div className="evaluator-row-main">
                    <span className="evaluator-slot">
                      <select value={assignment.id} onChange={(e) => onChange((t) => setEvaluatorAt(t, index, e.target.value))}>
                        <option value="">Seleziona…</option>
                        {options.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                      {esterno && <span className="esterno-flag">Esterno</span>}
                    </span>
                    <button
                      type="button"
                      className="evaluator-remove"
                      onClick={() => onChange((t) => removeEvaluatorSlot(t, index))}
                      aria-label="Rimuovi valutatore"
                    >
                      ×
                    </button>
                  </div>
                  {assignment.id && !canJoin(assignment.id) && (
                    <p className="vincolo-error">Non può partecipare: {why(assignment.id)}.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button type="button" className="btn btn-add" onClick={() => onChange((t) => addEvaluatorSlot(t))}>
          + Nuovo valutatore
        </button>
      </div>
    </>
  );
}
