import test from 'node:test';
import assert from 'node:assert/strict';
import { glitchtipApi } from './provider-api.mjs';
import { archiveIssue } from './archive.mjs';
test('HTTP adapter resolves once and checks the same issue after PUT', async () => {
  const calls=[];
  const api=glitchtipApi({origin:'https://errors.example',token:'server-only'},async(url,init)=>{
    calls.push({url,...init});return new Response(JSON.stringify({id:'42',status:calls.length===1?'unresolved':'resolved'}));
  });
  assert.deepEqual(await archiveIssue('42',api,{enabled:true}),{state:'applied',external_state:'resolved'});
  assert.deepEqual(calls.map(c=>c.method),['GET','PUT','GET']);
  assert.ok(calls.every(c=>c.url==='https://errors.example/api/0/issues/42/'&&c.redirect==='error'));
  assert.deepEqual(JSON.parse(calls[1].body),{status:'resolved'});
});
test('provider origin and credential are server configured, not event supplied', () => {
  for(const origin of ['http://errors.example','https://errors.example/path','https://user:pass@errors.example'])
    assert.throws(()=>glitchtipApi({origin,token:'secret'}));
  assert.throws(()=>glitchtipApi({origin:'https://errors.example',token:''}));
});
