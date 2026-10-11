import { open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signalPublisher } from '@langboard/app-server';
import { glitchtipApi } from './provider-api.mjs';
import { observeIssue } from './signals.mjs';

const maxBytes = 16384;

/** Exclusive, owner-only persistence completes before any host publication. */
export async function saveObservation(path, envelope) {
  const body = JSON.stringify(envelope) + '\n';
  if (Buffer.byteLength(body) > maxBytes) throw new Error('Observation exceeds storage limit');
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(body); await file.sync(); }
  finally { await file.close(); }
  const directory = await open(dirname(resolve(path)), 'r');
  try { await directory.sync(); }
  finally { await directory.close(); }
}

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
  if (resend) {
    const envelope = await loadObservation(path);
    const scope = config.scope;
    if (!scope || envelope.board_uid !== scope.boardUID || envelope.resource_uid !== scope.resourceUID ||
        envelope.app_revision !== scope.appRevision || envelope.binding_revision !== scope.bindingRevision) {
      throw new Error('Saved observation mapping changed; do not retarget an old event');
    }
    return publish(envelope);
  }
  return observeIssue({
    api: glitchtipApi({ origin: config.providerOrigin, token: credentials.providerToken }, request),
    issueId, scope: config.scope, observedAt,
    host, saveEnvelope: envelope => saveObservation(path, envelope),
  }, request);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, configPath, outputPath, issueId, observedAt] = process.argv.slice(2);
  if (!['observe', 'resend'].includes(mode) || !configPath || !outputPath ||
      (mode === 'observe' && (!issueId || !observedAt)) ||
      (mode === 'resend' && (issueId || observedAt)) || process.argv.length > 8) {
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
