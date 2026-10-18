import { fileURLToPath } from 'node:url';
import { cardInteractions, interactionStore } from '@langboard/app-server/interactions';
import { loadObservation } from './observation.mjs';
import { glitchtipApi } from './provider-api.mjs';
import { proposeIssueResolution } from './resolution.mjs';

/** Operator-selected mapping only. Recovery reads the exact stored request, not a new observation. */
export async function runResolution({ mode, config, path, key, expiresAt, credentials }, request = fetch) {
  if (!['propose', 'recover'].includes(mode)) throw new Error('Explicit propose or recover required');
  if (mode === 'propose' && config.resolutionEnabled !== true) return { state: 'disabled' };
  const { hostOrigin: origin, providerOrigin, scope } = config;
  const host = { origin, token: credentials.hostToken };
  const client = cardInteractions(host, request);
  const store = interactionStore(path, { origin, providerOrigin, boardUID: scope.boardUID, cardUID: scope.cardUID, externalId: scope.issueId });
  if (mode === 'recover') {
    const saved = await store.load();
    return client.recover(saved.board_uid, saved.card_uid, saved.request);
  }
  return proposeIssueResolution({
    enabled: config.resolutionEnabled === true,
    api: glitchtipApi({ origin: providerOrigin, token: credentials.providerToken }, request),
    issueId: scope.issueId, scope, cardUID: scope.cardUID, key, expiresAt, host,
    saveRequest: record => store.save(record),
  }, request);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, configPath, path, key, expiresAt] = process.argv.slice(2);
  if (!['propose', 'recover'].includes(mode) || !configPath || !path ||
      (mode === 'propose' && (!key || !expiresAt)) || (mode === 'recover' && (key || expiresAt)) || process.argv.length > 7) {
    console.error('Usage: resolution-runner.mjs propose CONFIG FILE REQUEST_KEY EXPIRES_AT | recover CONFIG FILE');
    process.exitCode = 2;
  } else {
    try {
      const receipt = await runResolution({ mode, config: await loadObservation(configPath), path, key, expiresAt,
        credentials: { hostToken: process.env.LANGBOARD_APP_TOKEN, providerToken: process.env.GLITCHTIP_READ_TOKEN } });
      process.stdout.write(JSON.stringify({ state: receipt.state, interaction_uid: receipt.interaction_uid }) + '\n');
    } catch {
      console.error('Resolution review failed; preserve the saved request and recover its outcome before any new submission.');
      process.exitCode = 1;
    }
  }
}
