import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
async function build(t, flags = [], publicUrl = '') {
  const directory = await mkdtemp(join(tmpdir(), 'glitchtip-package-profile-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'app.zip');
  const result = spawnSync(process.execPath, ['package.mjs', output, ...flags], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PUBLIC_URL: publicUrl },
  });
  return { result, output };
}
function inspect(output) {
  const result = spawnSync(process.env.PYTHON || 'python3', ['-c',
    'import json,sys;from zipfile import ZipFile;z=ZipFile(sys.argv[1]);print(json.dumps({"manifest":json.loads(z.read("manifest.json")),"files":z.namelist()}))', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('default ZIP stays read-only and includes portable themed panel assets', async t => {
  const { result, output } = await build(t);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /SQLite|ExperimentalWarning/);
  const { manifest, files } = inspect(output);
  assert.equal(manifest.declaration.version, '0.1.1');
  assert.deepEqual(manifest.declaration.capabilities, ['panels.render', 'signals.read']);
  assert.equal(manifest.declaration.card_interactions, undefined);
  assert.ok(files.includes('panel/icon-light.svg') && files.includes('panel/icon-dark.svg'));
  assert.ok(!files.includes('server.mjs') && !files.some(name => name.endsWith('.whl')));
});

test('requested workflow, interactions and signals survive actual Python ZIP validation', async t => {
  const { result, output } = await build(t, ['--workflow-cards', '--interactions', '--publish-signals'], 'https://glitchtip-app.example.test');
  assert.equal(result.status, 0, result.stderr);
  const { declaration } = inspect(output).manifest;
  assert.equal(declaration.version, '0.3.0');
  assert.ok(declaration.capabilities.includes('interactions.request'));
  assert.ok(declaration.capabilities.includes('signals.publish'));
  assert.deepEqual(declaration.workflow_requirements.required, ['active', 'review', 'closed']);
  assert.equal(declaration.card_interactions.issue[0].default_enabled, false);
  assert.equal(declaration.card_lifecycle.issue.archive.default_enabled, false);
  assert.deepEqual(declaration.trust.data_origins, ['https://glitchtip-app.example.test']);
});

test('unsupported or incomplete profiles cannot silently produce a read-only substitute', async t => {
  for (const [flags, origin] of [
    [['--workflow-cards'], ''], [['--interactions'], 'https://glitchtip-app.example.test'],
    [['--unknown-profile'], 'https://glitchtip-app.example.test'],
  ]) {
    const { result, output } = await build(t, flags, origin);
    assert.notEqual(result.status, 0);
    await assert.rejects(access(output));
  }
});
