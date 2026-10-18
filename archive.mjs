// The external action requires an authenticated adapter and current issue access.
export const cardLifecycle = {
  issue: { archive: { mode: 'external', action: 'resolve_issue', default_enabled: false, description: 'When archive sync is enabled, mark the linked issue resolved; retain events and permit future recurrence.' }, restore: 'retain_external_state' },
};

export async function archiveIssue(issueId, adapter, { enabled = false } = {}) {
  if (enabled !== true) return { state: 'retained', external_action: 'none' };
  if (typeof issueId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(issueId)) throw new Error('Invalid issue ID');
  let attempted = false;
  try {
    const before = await adapter.readIssue(issueId);
    if (String(before.id) !== issueId || !['resolved', 'unresolved', 'ignored'].includes(before.status)) throw new Error('Unexpected issue');
    if (before.status === 'resolved') return { state: 'already_applied', external_state: 'resolved' };
    attempted = true;
    await adapter.resolveIssue(issueId);
    const after = await adapter.readIssue(issueId);
    return String(after.id) === issueId && after.status === 'resolved'
      ? { state: 'applied', external_state: 'resolved' } : { state: 'unknown' };
  } catch {
    return { state: attempted ? 'unknown' : 'failed' };
  }
}
