import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeIssueResolution, resolutionDecision } from './resolution.mjs';
const scope={boardUID:'board000001',projectId:'3',projectSlug:'example'};
const host={origin:'https://host.example',token:'lbac_'+'a'.repeat(43)};
const issue={id:42,project:{id:3,slug:'example'},status:'resolved',firstSeen:'2020-01-01T00:00:00Z',lastSeen:'2020-01-02T00:00:00Z'};
const options=()=>({enabled:true,api:{readIssue:async()=>issue},issueId:'42',scope,cardUID:'card0000001',key:'resolved_42',expiresAt:new Date(Date.now()+5*60*1000).toISOString(),host,saveRequest:async()=>{}});

test('disabled is inert; unresolved and ignored observations never propose closure',async()=>{
  assert.deepEqual(await proposeIssueResolution({}),{state:'disabled'});
  for(const status of ['unresolved','ignored']){
    let writes=0;const args={...options(),api:{readIssue:async()=>({...issue,status})},saveRequest:async()=>{writes++;}};
    assert.deepEqual(await proposeIssueResolution(args,async()=>{writes++;}),{state:'not_resolved'});assert.equal(writes,0);
  }
});
test('fresh scoped evidence is persisted before exactly one human choice request',async()=>{
  const steps=[];let saved;
  const args={...options(),api:{readIssue:async id=>{steps.push('read');assert.equal(id,'42');return issue;}},saveRequest:async value=>{steps.push('save');saved=value;}};
  const receipt=await proposeIssueResolution(args,async(url,init)=>{
    steps.push('post');assert.equal(url,host.origin+'/apps/v1/boards/board000001/cards/card0000001/interactions');
    const body=JSON.parse(init.body);assert.deepEqual(body.request,saved.request);
    assert.deepEqual(body.request.outcomes,{close:{workflow_stage:'closed'}});
    assert.equal(body.request.presentation.type,'choice_card');
    assert.deepEqual(body.request.questions[0].choices.map(c=>c.id),['close','keep']);
    assert.ok(body.request.prompt.en.includes('observed resolved'));assert.ok(body.request.prompt.ko.includes('재발'));
    return{ok:true,json:async()=>({interaction_uid:'request0001',request:body.request,state:'pending',workflow_transitioned:false})};
  });
  assert.deepEqual(steps,['read','save','post']);assert.equal(receipt.workflow_transitioned,false);
});
test('foreign provider identity, project, stale expiry and persistence errors cannot send',async()=>{
  const variants=[{...issue,id:43},{...issue,project:{id:4,slug:'example'}},{...issue,project:{id:3,slug:'other'}},{...issue,status:'unknown'}];
  for(const row of variants){let writes=0;await assert.rejects(proposeIssueResolution({...options(),api:{readIssue:async()=>row},saveRequest:async()=>{writes++;}},async()=>{writes++;}));assert.equal(writes,0);}
  for(const expiresAt of ['2020-01-01T00:00:00Z',new Date(Date.now()+30*60*1000).toISOString()]) await assert.rejects(proposeIssueResolution({...options(),expiresAt},async()=>assert.fail('must not send')));
  await assert.rejects(proposeIssueResolution({...options(),saveRequest:async()=>{throw Error('disk full');}},async()=>assert.fail('must not send')),/disk full/);
});
test('lost reply preserves original request and does not retry or reread issue',async()=>{
  let reads=0,saved,calls=0;
  await assert.rejects(proposeIssueResolution({...options(),api:{readIssue:async()=>{reads++;return issue;}},saveRequest:async r=>{saved=r;}},async()=>{calls++;throw Error('lost reply');}),/lost reply/);
  assert.equal(reads,1);assert.equal(calls,1);assert.equal(saved.request.app_request_key,'resolved_42');
  assert.throws(()=>resolutionDecision('bad/key','42',new Date().toISOString(),new Date(Date.now()+60000).toISOString()));
});
