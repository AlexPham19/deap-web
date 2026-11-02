import test from 'node:test';
import assert from 'node:assert/strict';
import { localD1 } from '../scripts/local-d1.mjs';
import { handleCare,careHash } from '../worker/care.js';
const ORIGIN='https://care.example';
const makeEnv=()=>({DB:localD1(),SMS_ADMIN_EMAIL:'owner@example.invalid',SMS_TEST_TO:'+15550000001',TWILIO_TRIAL_TEMPLATE:'sms_internal_alerts'});
const request=(path,body,owner=true)=>new Request(ORIGIN+path,{method:body===undefined?'GET':'POST',headers:{Origin:ORIGIN,...(owner?{'oai-authenticated-user-email':'owner@example.invalid'}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const call=async(env,path,body,owner=true,clock)=>{const response=await handleCare(request(path,body,owner),env,undefined,clock);return {status:response.status,body:await response.json()};};
const newPatient=async env=>(await call(env,'/api/care/patients',{name:'Jordan Test'})).body.patient;
const newLink=async(env,id,kind='assessment')=>(await call(env,'/api/care/links',{patientId:id,kind})).body.link;
const answers={barriers:['forget','routine'],primary:'forget',other:'',preferences:['reminder']};
test('shared patient records require owner identity and hide phone from patient links',async()=>{
 const env=makeEnv();try{
  assert.equal((await call(env,'/api/care/patients',undefined,false)).status,401);
  const p=await newPatient(env);const link=await newLink(env,p.id);assert.equal(link.token.length,64);
  const raw=await env.DB.prepare('SELECT * FROM care_tokens').first();assert.equal(raw.hash,await careHash(link.token));assert.notEqual(raw.hash,link.token);assert.ok(!JSON.stringify(raw).includes(link.token));
  const opened=await call(env,'/api/patient/open',{token:link.token},false);assert.equal(opened.status,200);assert.equal(opened.body.session.name,'Jordan');assert.equal(opened.body.session.phone,undefined);assert.equal(opened.body.session.checkIns,undefined);
  assert.equal((await call(env,'/api/patient/open',{token:'a'.repeat(64)},false)).status,404);
 }finally{env.DB.close();}
});
test('full shared assessment → plan → check-in works without patient account or browser storage',async()=>{
 const env=makeEnv();try{
  const p=await newPatient(env);const link=await newLink(env,p.id);const submissionId=crypto.randomUUID();
  const invalid=await call(env,'/api/patient/submit',{token:link.token,submissionId,...answers,primary:'effects'},false);assert.equal(invalid.status,400);
  assert.equal((await call(env,'/api/patient/open',{token:link.token},false)).status,200);
  assert.equal((await call(env,'/api/patient/submit',{token:link.token,submissionId,...answers,phone:'+15550000009'},false)).status,200);
  const retry=await call(env,'/api/patient/submit',{token:link.token,submissionId,...answers},false);assert.equal(retry.body.alreadySaved,true);
  assert.equal((await call(env,'/api/patient/open',{token:link.token},false)).body.code,'LINK_USED');
  assert.equal((await call(env,'/api/patient/submit',{token:link.token,submissionId:crypto.randomUUID(),...answers},false)).status,410);
  const plan=await call(env,'/api/care/plan',{patientId:p.id,text:'A routine agreed with my care team.',strategies:['reminder'],reminderTime:'07:00'});assert.equal(plan.status,200);
  const check=await newLink(env,p.id,'checkin');const phoneView=await call(env,'/api/patient/open',{token:check.token},false);assert.equal(phoneView.body.session.plan.text,'A routine agreed with my care team.');
  assert.equal((await call(env,'/api/patient/submit',{token:check.token,submissionId:crypto.randomUUID(),rating:'yellow',note:'My schedule changed.'},false)).status,200);
  const ownerView=await call(env,'/api/care/patient?id='+p.id);assert.equal(ownerView.body.patient.checkIns.length,1);assert.equal(ownerView.body.patient.checkIns[0].note,'My schedule changed.');
  const raw=JSON.parse((await env.DB.prepare('SELECT data FROM care_patients WHERE id=?').bind(p.id).first()).data);assert.equal(raw.phone,env.SMS_TEST_TO);
 }finally{env.DB.close();}
});
test('exact 72-hour expiry and replacing an unused link are enforced server-side',async()=>{
 const env=makeEnv();try{
  const p=await newPatient(env);const old=await newLink(env,p.id);const current=await newLink(env,p.id);
  assert.equal((await call(env,'/api/patient/open',{token:old.token},false)).body.code,'LINK_REVOKED');
  assert.equal((await call(env,'/api/patient/open',{token:current.token},false,()=>current.expiresAt)).body.code,'LINK_EXPIRED');
  assert.equal((await call(env,'/api/patient/submit',{token:current.token,submissionId:crypto.randomUUID(),...answers},false,()=>current.expiresAt)).status,410);
 }finally{env.DB.close();}
});
test('concurrent submissions cannot create two check-ins from a one-time link',async()=>{
 const env=makeEnv();try{
  const p=await newPatient(env);const a=await newLink(env,p.id);await call(env,'/api/patient/submit',{token:a.token,submissionId:crypto.randomUUID(),...answers},false);
  await call(env,'/api/care/plan',{patientId:p.id,text:'Agreed plan',strategies:[],reminderTime:'08:00'});const c=await newLink(env,p.id,'checkin');
  const results=await Promise.all([1,2].map(()=>call(env,'/api/patient/submit',{token:c.token,submissionId:crypto.randomUUID(),rating:'green',note:'Okay'},false)));
  assert.equal(results.filter(r=>r.status===200).length,1);assert.equal((await call(env,'/api/care/patient?id='+p.id)).body.patient.checkIns.length,1);
 }finally{env.DB.close();}
});
test('trial blocks custom-link SMS without contacting provider or creating a false receipt',async()=>{
 const env=makeEnv();try{
  const p=await newPatient(env);const link=await newLink(env,p.id);let providerCalls=0;
  const response=await handleCare(request('/api/care/sms',{token:link.token,requestId:crypto.randomUUID()}),env,async()=>{providerCalls++;throw Error('must not send');});
  assert.equal(response.status,409);assert.equal((await response.json()).code,'TRIAL_CUSTOM_SMS_BLOCKED');assert.equal(providerCalls,0);assert.equal((await env.DB.prepare('SELECT * FROM care_outbox').all()).results.length,0);
 }finally{env.DB.close();}
});
