// Runnable check for the leader/evaluator exclusivity rule — node + assert, no framework.
// Run with: node src/lib/team.check.ts
import assert from 'node:assert/strict';
import {
  addEvaluatorSlot,
  assignLeader,
  removeEvaluatorSlot,
  setEvaluatorAt,
  type TeamSelection,
} from './team.ts';

let selection: TeamSelection = { leaderId: null, evaluators: [] };

selection = assignLeader(selection, 'a');
assert.deepEqual(selection, { leaderId: 'a', evaluators: [] }, 'assigning a leader sets leaderId');

selection = addEvaluatorSlot(selection);
assert.deepEqual(selection.evaluators, [{ id: '', campo: null }], 'adding a slot appends an empty row');

selection = setEvaluatorAt(selection, 0, 'b');
assert.deepEqual(selection.evaluators, [{ id: 'b', campo: null }], 'filling the id updates only that row');

selection = addEvaluatorSlot(selection);
selection = setEvaluatorAt(selection, 1, 'c');
assert.deepEqual(
  selection.evaluators,
  [
    { id: 'b', campo: null },
    { id: 'c', campo: null },
  ],
  'a second slot fills independently of the first',
);

const unchanged = setEvaluatorAt(selection, 0, 'a');
assert.deepEqual(unchanged, selection, 'picking the team leader as an evaluator is a no-op');

selection = removeEvaluatorSlot(selection, 0);
assert.deepEqual(selection.evaluators, [{ id: 'c', campo: null }], 'removing a slot drops only that row');

selection = assignLeader(selection, 'c');
assert.deepEqual(selection.evaluators, [], 'promoting an evaluator to leader removes them from the list');

console.log('team: all checks passed');
