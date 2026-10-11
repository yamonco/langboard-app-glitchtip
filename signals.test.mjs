import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIssue, observeIssue } from './signals.mjs';

test('GlitchTip normalization whitelists issue metadata and publishes one standard envelope', async () => {
  const row = { id: '42', project: { id: '2', slug: 'demo' }, status: 'unresolved', firstSeen: '2026-10-10T00:00:00Z', lastSeen: '2026-10-10T00:01:00Z', sensitive: 'discard' };
  const scope = { boardUID: 'board000001', resourceUID: 'resour00001', projectId: '2', projectSlug: 'demo', appRevision: 'a'.repeat(64), bindingRevision: 'b'.repeat(64) };
  const saved = []; const calls = [];
  const result = await observeIssue({ api: { readIssue: async id => ({ ...row, id }) }, issueId: '42', scope, observedAt: '2026-10-10T00:02:00Z', host: { origin: 'https://host.example', token: 'lbac_' + 'a'.repeat(43) }, saveEnvelope: async envelope => saved.push(envelope) }, async (url, options) => { calls.push([url, options]); return { ok: true, json: async () => ({ signal_uid: 'signal00001', duplicate: false }) }; });
  assert.equal(result.signal_uid, 'signal00001'); assert.equal(saved.length, 1); assert.equal(calls.length, 1);
  assert.equal(saved[0].event_type, 'issue.status_observed'); assert.equal(saved[0].outcome, 'unresolved'); assert.equal(saved[0].commit_sha, '');
  assert.equal(Object.hasOwn(saved[0], 'sensitive'), false);
});
test('normalization rejects foreign project or invalid status', () => {
  const base = { id: '42', project: { id: '2', slug: 'demo' }, status: 'unresolved', firstSeen: '2026-10-10T00:00:00Z', lastSeen: '2026-10-10T00:01:00Z' };
  assert.throws(() => normalizeIssue(base, { projectId: '3', projectSlug: 'demo' }, '2026-10-10T00:02:00Z'));
  assert.throws(() => normalizeIssue({ ...base, status: 'approved' }, { projectId: '2', projectSlug: 'demo' }, '2026-10-10T00:02:00Z'));
});
test('persistence failure prevents publication and unknown response never repeats the read', async () => {
  const row = { id: '42', project: { id: '2', slug: 'demo' }, status: 'resolved', firstSeen: '2026-10-10T00:00:00Z', lastSeen: '2026-10-10T00:01:00Z' };
  const scope = { boardUID: 'board000001', resourceUID: 'resour00001', projectId: '2', projectSlug: 'demo', appRevision: 'a'.repeat(64), bindingRevision: 'b'.repeat(64) };
  let reads = 0, sends = 0; const saved = [];
  const args = { api: { readIssue: async () => { reads++; return row; } }, issueId: '42', scope, observedAt: '2026-10-10T00:02:00Z', host: { origin: 'https://host.example', token: 'lbac_' + 'a'.repeat(43) } };
  const request = async () => { sends++; throw new Error('Lost response'); };
  await assert.rejects(observeIssue({ ...args, saveEnvelope: async () => { throw new Error('Disk full'); } }, request), /Disk full/);
  assert.equal(sends, 0);
  await assert.rejects(observeIssue({ ...args, saveEnvelope: async envelope => saved.push(envelope) }, request), /Lost response/);
  assert.equal(reads, 2); assert.equal(sends, 1); assert.equal(saved.length, 1);
  assert.equal(normalizeIssue(row, scope, args.observedAt).event_id, saved[0].event_id);
});
