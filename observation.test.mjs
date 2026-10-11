import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runObservation, loadObservation } from './observation.mjs';
const config = { hostOrigin: 'https://host.example', providerOrigin: 'https://errors.example',
  scope: { boardUID: 'board000001', resourceUID: 'resour00001', projectId: '2', projectSlug: 'demo',
    appRevision: 'a'.repeat(64), bindingRevision: 'b'.repeat(64) } };
const credentials = { hostToken: 'lbac_' + 'a'.repeat(43), providerToken: 'private-provider-test' };
const row = { id: '42', project: { id: '2', slug: 'demo' }, status: 'unresolved',
  firstSeen: '2026-10-10T00:00:00Z', lastSeen: '2026-10-10T00:01:00Z', privateMessage: 'do not store' };

test('lost publication retains durable metadata and explicit resend does not reread provider', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'glitchtip-observation-'));
  try {
    const path = join(directory, 'event.json');
    const bodies = []; let reads = 0;
    const request = async (url, options) => {
      if (url.startsWith(config.providerOrigin)) { reads++; return { ok: true, json: async () => row }; }
      bodies.push(options.body);
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      if (bodies.length === 1) throw new Error('Lost receipt');
      return { ok: true, json: async () => ({ signal_uid: 'signal00001', duplicate: true }) };
    };
    const args = { path, config, credentials, issueId: '42', observedAt: '2026-10-10T00:02:00Z' };
    await assert.rejects(runObservation(args, request), /Lost receipt/);
    const saved = await readFile(path, 'utf8');
    assert.ok(!saved.includes(credentials.hostToken) && !saved.includes(credentials.providerToken) && !saved.includes(row.privateMessage));
    assert.equal((await loadObservation(path)).envelopes[0].outcome, 'unresolved');
    const receipt = await runObservation({ ...args, resend: true }, request);
    assert.equal(receipt.duplicate, true);
    assert.equal(reads, 1);
    assert.deepEqual(bodies[0], bodies[1]);
    await assert.rejects(runObservation(args, request), /EEXIST/);
    assert.equal(bodies.length, 2);
    assert.equal(await readFile(path, 'utf8'), saved);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('oversized or malformed saved observation never publishes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'glitchtip-observation-'));
  try {
    const path = join(directory, 'bad.json'); let calls = 0;
    for (const content of ['x'.repeat(16385), '{}', 'bad JSON']) {
      await writeFile(path, content);
      await assert.rejects(runObservation({ path, config, credentials, resend: true }, async () => { calls++; }));
    }
    assert.equal(calls, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('HTTP success without a receipt preserves the event for explicit recovery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'glitchtip-observation-'));
  try {
    const path = join(directory, 'event.json'); let reads = 0; const bodies = [];
    const request = async (url, options) => {
      if (url.startsWith(config.providerOrigin)) { reads++; return { ok: true, json: async () => row }; }
      bodies.push(options.body);
      return { ok: true, json: async () => bodies.length === 1 ? {} : { signal_uid: 'signal00001', duplicate: true } };
    };
    const args = { path, config, credentials, issueId: '42', observedAt: '2026-10-10T00:02:00Z' };
    await assert.rejects(runObservation(args, request), /outcome unknown: invalid receipt/);
    assert.equal(bodies.length, 1);
    const saved = await readFile(path, 'utf8');
    assert.equal((await runObservation({ ...args, resend: true }, request)).duplicate, true);
    assert.equal(reads, 1);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal(await readFile(path, 'utf8'), saved);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('saved events cannot be retargeted to another resource or approval revision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'glitchtip-observation-'));
  try {
    const path = join(directory, 'saved.json');
    await runObservation({ path, config, credentials, issueId: '42', observedAt: '2026-10-10T00:02:00Z' }, async url =>
      url.startsWith(config.providerOrigin) ? { ok: true, json: async () => row } :
        { ok: true, json: async () => ({ signal_uid: 'signal00001', duplicate: false }) });
    let calls = 0;
    for (const patch of [{ resourceUID: 'other000001' }, { appRevision: 'c'.repeat(64) }]) {
      await assert.rejects(runObservation({ path, config: { ...config, scope: { ...config.scope, ...patch } }, credentials, resend: true },
        async () => { calls++; }), /destination changed/);
    }
    assert.equal(calls, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('CLI accepts the documented observe arguments and returns sanitized failure', () => {
  const result = spawnSync(process.execPath, ['observation.mjs', 'observe', '/nonexistent/config.json', '/nonexistent/event.json', '42', '2026-10-10T00:02:00Z'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('Observation failed;'));
  assert.ok(!result.stderr.includes('Usage:'));
});

test('CLI rejects extra arguments instead of ignoring them', () => {
  const result = spawnSync(process.execPath, ['observation.mjs', 'observe', 'config.json', 'event.json', '42', '2026-10-10T00:02:00Z', 'extra'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('Usage:'));
});
