// Runnable check for the accreditation-window rule — node + assert, no framework.
// Run with: node src/lib/accreditationWindow.check.ts
import assert from 'node:assert/strict';
import { isWithinAccreditationWindow } from './accreditationWindow.ts';

assert.equal(isWithinAccreditationWindow('2026-11-03', '2026-11-01', '2026-11-07'), true, 'a day inside the window is included');
assert.equal(isWithinAccreditationWindow('2026-11-01', '2026-11-01', '2026-11-07'), true, 'the lower bound itself is included');
assert.equal(isWithinAccreditationWindow('2026-11-07', '2026-11-01', '2026-11-07'), true, 'the upper bound itself is included');
assert.equal(isWithinAccreditationWindow('2026-11-08', '2026-11-01', '2026-11-07'), false, 'the day right after the window is excluded');
assert.equal(isWithinAccreditationWindow('2026-10-31', '2026-11-01', '2026-11-07'), false, 'the day right before the window is excluded');
assert.equal(isWithinAccreditationWindow('2026-11-03', '', '2026-11-07'), false, 'an unset lower bound means no restriction yet');
assert.equal(isWithinAccreditationWindow('2026-11-03', '2026-11-01', ''), false, 'an unset upper bound means no restriction yet');

console.log('accreditationWindow: all checks passed');
