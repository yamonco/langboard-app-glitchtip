import { createHash } from 'node:crypto';
import { signalPublisher } from '@langboard/app-server';

export const signalPolicy = {
  version: 1, event_types: ['issue.status_observed'], resource_types: ['project'],
  outcome_states: { unresolved: 'failed', resolved: 'resolved', ignored: 'ignored' },
  commit_mode: 'empty', time_basis: 'observation',
};

/** Only whitelisted metadata leaves the provider; observation is not resolution time. */
export function normalizeIssue(row, scope, observedAt) {
  const numeric = value => (typeof value === 'string' || Number.isSafeInteger(value)) && /^[1-9][0-9]{0,19}$/.test(String(value));
  const stamp = value => typeof value === 'string' && value.length <= 40 && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  if (!row || !numeric(row.id) || !numeric(scope.projectId) || String(row.project?.id) !== scope.projectId ||
      row.project?.slug !== scope.projectSlug || !Object.hasOwn(signalPolicy.outcome_states, row.status) ||
      !stamp(observedAt) || !stamp(row.firstSeen) || !stamp(row.lastSeen) ||
      Date.parse(row.firstSeen) > Date.parse(row.lastSeen) || Date.parse(row.lastSeen) > Date.parse(observedAt)) throw new Error('Invalid project issue observation');
  const metadata = { id: String(row.id), project: scope.projectId, slug: scope.projectSlug, status: row.status,
    firstSeen: new Date(row.firstSeen).toISOString(), lastSeen: new Date(row.lastSeen).toISOString(),
    observedAt: new Date(observedAt).toISOString() };
  return { event_id: createHash('sha256').update(JSON.stringify(metadata)).digest('hex'),
    event_type: 'issue.status_observed', occurred_at: metadata.observedAt,
    external_id: metadata.id, outcome: metadata.status, commit_sha: '' };
}

/** Caller owns current mapping and durable envelopes. Publication never creates a card. */
export async function observeIssue({ api, issueId, scope, observedAt, host, saveEnvelope }, request = fetch) {
  const row = await api.readIssue(issueId);
  if (String(row?.id) !== issueId) throw new Error('Provider issue identity mismatch');
  const envelope = { version: 1, board_uid: scope.boardUID, resource_uid: scope.resourceUID,
    app_revision: scope.appRevision, binding_revision: scope.bindingRevision,
    ...normalizeIssue(row, scope, observedAt) };
  // Persist before submission; recovery explicitly reuses this envelope, not a new observation.
  await saveEnvelope(envelope);
  return signalPublisher(host, request)(envelope);
}
