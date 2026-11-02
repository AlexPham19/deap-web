import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSms } from '../worker/index.js';
const env={SMS_ADMIN_EMAIL:'owner@example.invalid',SMS_TEST_TO:'+15550000001',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'fixture-not-a-real-token',TWILIO_FROM_NUMBER:'+15550000002'};
const make=(route='/api/sms/test',options={},owner=env.SMS_ADMIN_EMAIL)=>new Request('https://app.example'+route,{...options,headers:{'oai-authenticated-user-email':owner,'Origin':'https://app.example','Content-Type':'application/json',...options.headers}});
const post=(id=crypto.randomUUID(),extra={})=>({method:'POST',body:JSON.stringify({requestId:id,...extra})});
test('unauthenticated/public visitors cannot access SMS configuration',async()=>{
 const request=new Request('https://app.example/api/sms/status');const response=await handleSms(request,env);assert.equal(response.status,401);
 assert.equal((await handleSms(make('/api/sms/status',{},'someone@example.invalid'),env)).status,403);
});
test('missing provider credentials produce no outbound request and expose no secrets',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('should not happen');};const missing={SMS_ADMIN_EMAIL:env.SMS_ADMIN_EMAIL,SMS_TEST_TO:env.SMS_TEST_TO};
 const status=await (await handleSms(make('/api/sms/status'),missing,fetcher)).json();assert.equal(status.configured,false);assert.equal(status.recipient,'••• ••• 0001');
 assert.equal((await handleSms(make('/api/sms/test',post()),missing,fetcher)).status,503);assert.equal(calls,0);
});
test('server rejects a client-selected recipient or message and cross-origin requests',async()=>{
 assert.equal((await handleSms(make('/api/sms/test',post(undefined,{to:'+15550000003'})),env)).status,400);
 assert.equal((await handleSms(make('/api/sms/test',{...post(),headers:{Origin:'https://other.example'}}),env)).status,403);
});
test('provider acceptance is not delivery; repeated request reuses receipt',async()=>{
 let calls=0;const id=crypto.randomUUID();const fixtureEnv={...env,SMS_ADMIN_EMAIL:'receipt@example.invalid'};
 const fetcher=async(url,options)=>{calls++;assert.equal(new URLSearchParams(options.body).get('To'),fixtureEnv.SMS_TEST_TO);assert.equal(new URLSearchParams(options.body).get('From'),fixtureEnv.TWILIO_FROM_NUMBER);assert.ok(new URLSearchParams(options.body).get('Body').endsWith(id));return Response.json({sid:'SM'+'b'.repeat(32),status:'queued'});};
 const a=await (await handleSms(make('/api/sms/test',post(id),fixtureEnv.SMS_ADMIN_EMAIL),fixtureEnv,fetcher)).json();assert.equal(a.ok,true);assert.equal(a.delivered,false);assert.equal(a.status,'queued');
 const b=await (await handleSms(make('/api/sms/test',post(id),fixtureEnv.SMS_ADMIN_EMAIL),fixtureEnv,fetcher)).json();assert.equal(b.sid,a.sid);assert.equal(calls,1);
});
test('ambiguous network outcome is retained without automatic retry',async()=>{
 const id=crypto.randomUUID();let calls=0;const fixtureEnv={...env,SMS_ADMIN_EMAIL:'uncertain@example.invalid'};const fetcher=async()=>{calls++;throw Error('network');};
 const a=await (await handleSms(make('/api/sms/test',post(id),fixtureEnv.SMS_ADMIN_EMAIL),fixtureEnv,fetcher)).json();assert.equal(a.code,'DELIVERY_UNKNOWN');
 await handleSms(make('/api/sms/test',post(id),fixtureEnv.SMS_ADMIN_EMAIL),fixtureEnv,fetcher);assert.equal(calls,1);
});
test('delivery check verifies the authorized recipient and test body',async()=>{
 const id=crypto.randomUUID();const sid='SM'+'c'.repeat(32);const message='KTx-CONNECT technical test. SMS integration is working. No patient information is included. Ref: '+id;
 const response=await handleSms(make(`/api/sms/receipt?sid=${sid}&requestId=${id}`),env,async()=>Response.json({sid,to:env.SMS_TEST_TO,body:message,status:'delivered'}));assert.equal((await response.json()).delivered,true);
 const denied=await handleSms(make(`/api/sms/receipt?sid=${sid}`),env,async()=>Response.json({sid,to:'+15550000009',body:message,status:'delivered'}));assert.equal(denied.status,403);
});
