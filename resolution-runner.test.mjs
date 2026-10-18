import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runResolution} from './resolution-runner.mjs';
const config={hostOrigin:'https://host.example',providerOrigin:'https://provider.example',resolutionEnabled:true,
 scope:{boardUID:'board000001',cardUID:'card0000001',issueId:'42',projectId:'3',projectSlug:'example'}};
const credentials={hostToken:'lbac_'+'a'.repeat(43),providerToken:'provider-secret'};
const row={id:42,project:{id:3,slug:'example'},status:'resolved',firstSeen:'2020-01-01T00:00:00Z',lastSeen:'2020-01-02T00:00:00Z'};

test('lost submission is recovered after restart without provider reread or request replay',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'resolution-runner-'));
 try{
  const path=join(directory,'pending.json');const calls=[];let pending;
  await assert.rejects(runResolution({mode:'propose',config,path,key:'resolution_42',expiresAt:new Date(Date.now()+300000).toISOString(),credentials},async(url,options)=>{
   calls.push(options.method+' '+url);
   if(url.startsWith(config.providerOrigin)){assert.equal(options.method,'GET');return{ok:true,json:async()=>row};}
   pending=JSON.parse(options.body).request;throw Error('Lost reply');
  }),/Lost reply/);
  const disk=await readFile(path,'utf8');assert.ok(!disk.includes(credentials.hostToken));assert.ok(!disk.includes(credentials.providerToken));
  const result=await runResolution({mode:'recover',config,path,credentials:{hostToken:credentials.hostToken}},async(url,options)=>{
   calls.push(options.method+' '+url);assert.equal(options.method,'GET');assert.ok(url.startsWith(config.hostOrigin));
   return{ok:true,json:async()=>({interaction_uid:'request0001',request:pending,state:'pending'})};
  });
  assert.equal(result.state,'pending');assert.equal(calls.length,3);
  assert.equal(await readFile(path,'utf8'),disk);
  await assert.rejects(runResolution({mode:'recover',config:{...config,providerOrigin:'https://other.example'},path,credentials},async()=>assert.fail('retargeted request')),/destination changed/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('disabled feature and absent recovery record cannot send mutations',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'resolution-disabled-'));
 try{
  const path=join(directory,'pending.json');let calls=0;
  const result=await runResolution({mode:'propose',config:{resolutionEnabled:false},path,credentials:{}},async()=>{calls++;});
  assert.equal(result.state,'disabled');assert.equal(calls,0);
  await assert.rejects(runResolution({mode:'recover',config,path,credentials},async()=>{calls++;}));assert.equal(calls,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});
