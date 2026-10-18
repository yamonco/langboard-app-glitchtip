import { cardInteractions as interactionClient } from '@langboard/app-server/interactions';
import { normalizeIssue } from './signals.mjs';

export const resolutionInteractions = {
  issue: [{ key: 'resolution_review', kind: 'question', default_enabled: false,
    description: 'After a fresh resolved observation, ask whether to close the linked card or keep it open.',
    choices: ['close', 'keep'] }],
};

export function resolutionDecision(key, issueId, observedAt, expiresAt) {
  if (typeof key !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(key) ||
      !/^[1-9][0-9]{0,19}$/.test(issueId) || ![observedAt, expiresAt].every(value =>
        typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))) ||
      Date.parse(expiresAt) <= Date.parse(observedAt) || Date.parse(expiresAt) - Date.parse(observedAt) > 15 * 60 * 1000) {
    throw new Error('Stable request identity and an explicit expiry within fifteen minutes required');
  }
  const prompt = {
    en: `Issue ${issueId} was observed resolved at ${observedAt}. Close this card or keep it open? This is an observation, not proof that the issue cannot recur.`,
    ko: `이슈 ${issueId}의 해결 상태를 ${observedAt}에 확인했습니다. 카드를 종료할까요, 유지할까요? 관측 이후 이슈가 재발할 수 있습니다.`,
  };
  return { schema_version: 1, kind: 'question', app_request_key: key, expires_at: expiresAt, prompt,
    questions: [{ id: 'outcome', prompt, type: 'single_choice', choices: [
      { id: 'close', label: { en: 'Close card', ko: '카드 종료' } },
      { id: 'keep', label: { en: 'Keep open', ko: '열린 상태 유지' } },
    ] }], presentation: { type: 'choice_card' }, outcomes: { close: { workflow_stage: 'closed' } } };
}

/** The operator owns the card/issue mapping; no provider mutation or card movement. */
export async function proposeIssueResolution({ enabled = false, api, issueId, scope, cardUID, key, expiresAt, host, saveRequest }, request = fetch) {
  if (enabled !== true) return { state: 'disabled' };
  if (!/^[A-Za-z0-9]{11}$/.test(scope?.boardUID) || !/^[A-Za-z0-9]{11}$/.test(cardUID) || typeof saveRequest !== 'function') {
    throw new Error('Trusted card mapping and durable request storage required');
  }
  const client = interactionClient(host, request);
  const row = await api.readIssue(issueId);
  if (String(row?.id) !== issueId) throw new Error('Provider issue identity mismatch');
  const observedAt = new Date().toISOString();
  const observation = normalizeIssue(row, scope, observedAt);
  if (observation.outcome !== 'resolved') return { state: 'not_resolved' };
  const decision = resolutionDecision(key, issueId, observedAt, expiresAt);
  await saveRequest({ version: 1, board_uid: scope.boardUID, card_uid: cardUID, request: decision });
  return client.create(scope.boardUID, cardUID, decision);
}
