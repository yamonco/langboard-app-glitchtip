import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveIssue } from './archive.mjs';
test('resolve and verify the same issue; dedupe a previously resolved issue', async () => {
  let state = 'unresolved', writes = 0;
  const adapter = { readIssue: async id => ({ id, status: state }), resolveIssue: async () => { writes++; state = 'resolved'; } };
  assert.deepEqual(await archiveIssue('42', adapter, { enabled: true }), { state: 'applied', external_state: 'resolved' });
  assert.deepEqual(await archiveIssue('42', adapter, { enabled: true }), { state: 'already_applied', external_state: 'resolved' });
  assert.equal(writes, 1);
});
test('lost mutation response is unknown without automatic retry', async () => {
  let writes = 0;
  const result = await archiveIssue('42', { readIssue: async () => ({ id: '42', status: 'unresolved' }), resolveIssue: async () => { writes++; throw new Error('private'); } }, { enabled: true });
  assert.deepEqual(result, { state: 'unknown' });
  assert.equal(writes, 1);
});
test('default-off archive retains state without an adapter call', async () => {
  assert.deepEqual(await archiveIssue('42', null), { state: 'retained', external_action: 'none' });
});
