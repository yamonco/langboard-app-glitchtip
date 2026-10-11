import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { archiveReceiver, archiveStore } from './archive-receiver.mjs';
test('shared receiver verifies authority and replays reports without another resolution',async()=>{
 const event={schema_version:1,event_type:'io.langboard.app.card.archived.v1',event_uid:'event000001',archive_uid:'archiv00001',board_uid:'board000001',card_uid:'card0000001',connection_uid:'connect0001',app_key:'glitchtip-panel',card_type:'issue',action:'resolve_issue',external_resource_id:'42'};
 const body=Buffer.from(JSON.stringify(event)),timestamp=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256','test-secret').update(timestamp+'.').update(body).digest('hex');
 const headers={'x-langboard-webhook-version':'1','x-langboard-webhook-timestamp':timestamp,'x-langboard-webhook-signature':`v1=${signature}`};
 const store=archiveStore(':memory:');let writes=0,reports=0;
 const receive=archiveReceiver({secret:'test-secret',store,resolveIssue:async()=>({enabled:true,appKey:event.app_key,boardUID:event.board_uid,connectionUID:event.connection_uid,issueId:'42',provider:{origin:'https://errors.example',token:'server-only'}}),host:{read:async()=>({archive_uid:event.archive_uid,receipt:{event_uid:event.event_uid,connection_uid:event.connection_uid,card_type:'issue',external_resource_id:'42',archive_policy:{action:'resolve_issue'},outcome_revision:0,state:'pending'}}),report:async(e,r)=>{reports++;assert.equal(r.outcome.state,'applied');return{changed:true};}},providerRequest:async(url,init)=>{if(init.method==='PUT')writes++;return new Response(JSON.stringify({id:'42',status:writes?'resolved':'unresolved'}));}});
 await receive(body,headers);await receive(body,headers);assert.equal(writes,1);assert.equal(reports,2);store.close();
});
