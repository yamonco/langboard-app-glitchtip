import test from 'node:test';
import assert from 'node:assert/strict';
import { panelServer, configuration, declaration } from './server.mjs';
import { createInbox, createSourceInbox, visibleItems, provider } from './public/inbox.mjs';

test('workflow declaration is opt-in and never enables issue resolution by itself', () => {
  const config = configuration({ PUBLIC_URL: 'https://panel.example' });
  assert.equal(declaration(config).card_lifecycle, undefined);
  const workflow = declaration(config, { workflowCards: true });
  assert.equal(workflow.schema_version, 2);
  assert.equal(workflow.card_lifecycle.issue.archive.default_enabled, false);
  assert.equal(workflow.capabilities.includes('events.receive'), true);
  assert.throws(() => declaration(config, { workflowCards: true, interactions: true }));
});

test('public static routes, opaque iframe module CORS and declaration', async t => {
  const config = configuration({ HOST_ORIGIN: 'https://host.example', PUBLIC_URL: 'https://panel.example' });
  const server = panelServer(config); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/panel.mjs', '/inbox.mjs', '/view.mjs', '/config.mjs', '/sdk/index.mjs', '/manifest.json']) {
    const response = await fetch(url + path); assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors https:\/\/host.example/);
  }
  const manifest = await (await fetch(url + '/manifest.json')).json();
  assert.deepEqual(manifest, declaration(config)); assert.deepEqual(manifest.capabilities, ['panels.render', 'signals.read']); assert.deepEqual(manifest.signal_sources, ['glitchtip']);
  for (const path of ['/server.mjs', '/package.json', '/sdk/index.mjs?other', '/%2e%2e/server.mjs']) assert.equal((await fetch(url + path)).status, 404);
  assert.equal((await fetch(url + '/', { method: 'POST' })).status, 405);
  assert.throws(() => configuration({ HOST_ORIGIN: 'https://host.example/path' }));
  assert.throws(() => configuration({ PUBLIC_URL: 'http://panel.example' }));
});
test('provider request, pagination, filters and aborted response cleanup', async () => {
  const abort = new AbortController(); const requests = []; const states = [];
  const item = { provider, resource_name: 'demo', external_id: '42', event_type: 'status', outcome: 'success', commit_sha: 'abc' };
  const inbox = createInbox({ signal: abort.signal, request: async (operation, params) => { requests.push([operation, params]); return { items: [item, {provider: 'other'}], next_cursor: params.after ? null : 'Cursor1' }; } }, state => states.push(state));
  await inbox.load(); await inbox.load(true);
  assert.deepEqual(requests, [['signals.list', {provider}], ['signals.list', {provider, after: 'Cursor1'}]]);
  assert.equal(states.at(-1).items.length, 2); assert.equal(states.at(-1).nextCursor, null);
  assert.equal(visibleItems([item], 'ABC', 'success').length, 1); assert.equal(visibleItems([item], 'demo', 'failed').length, 0);
  abort.abort(); const before = requests.length; await inbox.load(); assert.equal(requests.length, before);
  const pendingAbort = new AbortController(); let release; const published = [];
  const pending = createInbox({signal: pendingAbort.signal, request: () => new Promise(resolve => {release = resolve})}, state => published.push(state));
  const task = pending.load(); pendingAbort.abort(); release({items: [item], next_cursor: null}); await task;
  assert.equal(published.length, 1);
});
test('request failures are visible and refresh remains available', async () => {
  const states = []; const session = {signal: new AbortController().signal, request: async () => {throw new Error('signals.read permission required')}};
  await createInbox(session, state => states.push(state)).load();
  assert.equal(states.at(-1).busy, false); assert.match(states.at(-1).error, /permission required/);
});

import { createPanel } from './public/view.mjs';
test('render uses host widgets, Korean labels and readonly signal evidence', () => {
  const row = {provider, signal_uid: '1', resource_name: 'demo', external_id: '42', event_type: 'observed', outcome: 'failed', occurred_at: '2026-10-10', time_basis: 'observation'};
  let index = 0;
  const initial = [{items:[row], nextCursor:'Cursor1', busy:false, error:'', source: provider}, '', '', provider];
  const React = {
    createElement: (type, props, ...children) => ({type, props, children}),
    useState: () => [initial[index++], () => {}],
    useMemo: factory => factory(), useEffect: () => {},
  };
  const Button = Symbol('HostButton'), Badge = Symbol('HostBadge'), Input = Symbol('HostInput');
  const tree = createPanel({React, Button, Badge, Input}, {context:{language:'ko'}, state:null, signal:new AbortController().signal, saveState: () => {}, request: async () => ({items:[],next_cursor:null})})();
  const nodes = [];
  const walk = node => {if (node && typeof node === 'object') {nodes.push(node); for(const child of node.children || []) walk(child);}};
  walk(tree);
  assert.equal(nodes.filter(node => node.type === Button).length, 2);
  assert.equal(nodes.filter(node => node.type === Badge).length, 1);
  assert.ok(nodes.some(node => node.children?.includes('새로고침')));
  assert.ok(nodes.some(node => node.children?.some(child => typeof child === 'string' && child.includes('관측'))));
  assert.equal(nodes.filter(node => node.type === Input).length, 1);
});


test('HTTP manifest preserves the explicit workflow profile', async t => {
  const config = configuration({ HOST_ORIGIN: 'https://host.example', PUBLIC_URL: 'https://panel.example' });
  const profile = { workflowCards: true };
  const server = panelServer(config, profile);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const manifest = await (await fetch(`http://127.0.0.1:${server.address().port}/manifest.json`)).json();
  assert.deepEqual(manifest, declaration(config, profile));
  assert.equal(manifest.schema_version, 2);
  assert.ok(manifest.capabilities.includes('cards.create'));
});

test('published source selection follows the HTTP declaration without granting authority', async t => {
  const config = configuration({ PUBLIC_URL: 'https://panel.example' });
  const server = panelServer(config, { publishSignals: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const manifest = await (await fetch(url + '/manifest.json')).json();
  const module = await (await fetch(url + '/config.mjs')).text();
  const browserConfig = JSON.parse(module.slice('export default '.length, -1));
  assert.deepEqual(browserConfig.signalSources, ['glitchtip', 'glitchtip-panel']);
  assert.deepEqual(browserConfig.signalSources, manifest.signal_sources);
  assert.deepEqual(Object.keys(browserConfig).sort(), ['hostOrigin', 'signalSources']);
});

test('source change drops old replies and cursors; disposal and effect replay remain safe', async () => {
  const abort = new AbortController(), requests = [], published = [];
  let release;
  const session = { signal: abort.signal, request: async (_operation, params) => {
    requests.push(params);
    if (params.provider === 'glitchtip') return new Promise(resolve => { release = resolve; });
    return {items: [{provider: 'glitchtip-panel', external_id:'42'}], next_cursor:'Cursor2'};
  }};
  const old = createSourceInbox(session, state => published.push(state), 'glitchtip');
  const pending = old.start(); old.dispose();
  const current = createSourceInbox(session, state => published.push(state), 'glitchtip-panel');
  await current.start(); const count = published.length;
  release({items:[{provider:'glitchtip', external_id:'old'}], next_cursor:'Cursor1'}); await pending;
  assert.equal(published.length, count);
  assert.equal(published.at(-1).source, 'glitchtip-panel');
  assert.equal(visibleItems(published.at(-1).items, '', '', 'glitchtip-panel').length, 1);
  await current.load(true); assert.deepEqual(requests.at(-1), {provider:'glitchtip-panel', after:'Cursor2'});
  current.dispose(); await current.start(); assert.deepEqual(requests.at(-1), {provider:'glitchtip-panel'});
  abort.abort(); const before = requests.length; await current.load(); assert.equal(requests.length, before);
  current.dispose();
});
