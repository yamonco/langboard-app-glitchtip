import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { signalPublisher, signalStore } from '@langboard/app-server';
import { glitchtipApi } from './provider-api.mjs';
import { observeIssue } from './signals.mjs';

const maxBytes = 16384;

export async function loadObservation(path) {
  const file = await open(path, 'r');
  try {
    const size = (await file.stat()).size;
    if (!size || size > maxBytes) throw new Error('Invalid observation file size');
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxBytes) throw new Error('Observation exceeds storage limit');
    return JSON.parse(buffer.subarray(0, bytesRead).toString());
  } finally { await file.close(); }
}

/** The operator owns the private mapping; tokens never enter the saved envelope. */
export async function runObservation({ issueId, resend = false, path, config, credentials, observedAt }, request = fetch) {
  const host = { origin: config.hostOrigin, token: credentials.hostToken };
  const publish = signalPublisher(host, request); // Validate host credential before provider access.
  const store = signalStore(path, { origin: config.hostOrigin, providerOrigin: config.providerOrigin, ...config.scope });
  if (resend) {
    const envelopes = await store.load();
    if (envelopes.length !== 1) throw new Error('Expected one issue observation');
    const [envelope] = envelopes;
    return publish(envelope);
  }
  return observeIssue({
    api: glitchtipApi({ origin: config.providerOrigin, token: credentials.providerToken }, request),
    issueId, scope: config.scope, observedAt,
    host, saveEnvelope: envelope => store.save([envelope]),
  }, request);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, configPath, outputPath, issueId, observedAt] = process.argv.slice(2);
  if (!['observe', 'resend'].includes(mode) || !configPath || !outputPath ||
      (mode === 'observe' && (!issueId || !observedAt)) ||
      (mode === 'resend' && (issueId || observedAt)) || process.argv.length > 7) {
    console.error('Usage: observation.mjs observe CONFIG FILE ISSUE_ID OBSERVED_AT | resend CONFIG FILE');
    process.exitCode = 2;
  } else {
    try {
      const config = await loadObservation(configPath);
      const receipt = await runObservation({ resend: mode === 'resend', config, path: outputPath, issueId, observedAt,
        credentials: { hostToken: process.env.LANGBOARD_APP_TOKEN, providerToken: process.env.GLITCHTIP_READ_TOKEN } });
      process.stdout.write(JSON.stringify({ signal_uid: receipt.signal_uid, duplicate: receipt.duplicate }) + '\n');
    } catch {
      console.error('Observation failed; inspect the saved envelope and native receipt before explicit resend.');
      process.exitCode = 1;
    }
  }
}
