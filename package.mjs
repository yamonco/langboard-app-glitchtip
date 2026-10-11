import {mkdtemp, readFile, writeFile, mkdir, cp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {configuration, declaration} from './server.mjs';

const config = configuration({PUBLIC_URL: 'https://package.example.invalid', HOST_ORIGIN: 'https://host.example.invalid'});
const manifest = declaration(config);
const staging = await mkdtemp(join(tmpdir(), 'langboard-app-package-'));
try {
  await cp('public', join(staging, 'panel'), {recursive: true});
  await mkdir(join(staging, 'panel/sdk'));
  for (const name of ['index.mjs', 'inbox.mjs']) await cp(`node_modules/@langboard/app-panel/${name}`, join(staging, 'panel/sdk', name));
  for (const name of ['panel.mjs', 'inbox.mjs']) {
    const path = join(staging, 'panel', name);
    const source = (await readFile(path, 'utf8')).replaceAll("'/sdk/index.mjs'", "'./sdk/index.mjs'").replaceAll("'@langboard/app-panel/inbox'", "'./sdk/inbox.mjs'");
    await writeFile(path, source);
  }
  const html = join(staging, 'panel/index.html');
  await writeFile(html, (await readFile(html, 'utf8')).replace(/<script type="importmap">.*?<\/script>/s, '').replace('src="/panel.mjs"', 'src="./panel.mjs"'));
  await writeFile(join(staging, 'panel/config.mjs'), `import {hostOrigin} from './host.mjs';\nexport default {hostOrigin, signalSources: ${JSON.stringify(manifest.signal_sources)}};\n`);
  await writeFile(join(staging, 'panel/host.mjs'), 'throw new Error("Install this package on a Langboard host before opening its panel");\n');
  await writeFile(join(staging, 'manifest.json'), JSON.stringify({package_version: 1, declaration: manifest, panel_entry: 'panel/index.html', store: {icon: 'panel/icon-light.svg', icon_dark: 'panel/icon-dark.svg', screenshots: []}}));
  const output = resolve(process.argv[2] || `dist/${JSON.parse(await readFile('package.json', 'utf8')).name}.zip`);
  const result = spawnSync(process.env.PYTHON || 'python3', ['-m', 'langboard_sdk.package', join(staging, 'manifest.json'), join(staging, 'panel'), output], {
    stdio: 'inherit', env: {...process.env, PYTHONPATH: resolve('vendor/langboard_sdk-0.2.30-py3-none-any.whl')},
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Package build failed');
  console.log(output);
} finally { await rm(staging, {recursive: true, force: true}); }
