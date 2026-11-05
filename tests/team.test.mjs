import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from '../scripts/local-d1.mjs';
import {handleTeam} from '../worker/team.js';
import {handleCare} from '../worker/care.js';
const origin='https://team.example',owner={id:'owner-id',email:'owner@example.invalid'},doctor={id:'doctor-id',email:'doctor@example.invalid'},coord={id:'coord-id',email:'coord@example.invalid'};
const env=()=>({DB:localD1(),SMS_ADMIN_EMAIL:owner.email,SMS_TEST_TO:'+15550000001',TWILIO_TRIAL_TEMPLATE:'sms_internal_alerts'});
const req=(path,body,actor=owner)=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(actor?{'oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const call=async(e,path,body,actor=owner,clock,fetcher)=>{const r=path.startsWith('/api/team/')?await handleTeam(req(path,body,actor),e,clock):await handleCare(req(path,body,actor),e,fetcher,clock);return{status:r.status,body:await r.json()};};
const invite=async(e,person,role)=>{const r=await call(e,'/api/team/invite',{email:person.email,role});assert.equal(r.status,201);return r.body.invite;};
const accept=async(e,person,role)=>{const i=await invite(e,person,role);const r=await call(e,'/api/team/accept',{token:i.url.split('/').at(-1)},person);assert.equal(r.status,200);return i;};
const patient=async(e,actor=owner)=>{const r=await call(e,'/api/care/patients',{name:'Fictional Person'},actor);assert.equal(r.status,201);return r.body.patient;};
const link=async(e,p,kind='assessment',actor=owner)=>{const r=await call(e,'/api/care/links',{patientId:p.id,kind},actor);assert.equal(r.status,201);return r.body.link;};
const answer={barriers:['forget'],primary:'forget',other:'',preferences:[]};
const plan={text:'Fictional agreed plan',strategies:[],reminderTime:'07:00'};
test('invites bind to authenticated email, expire, revoke, consume once and cannot escalate existing members',async()=>{
 const e=env();try{
  assert.equal((await call(e,'/api/team/me',undefined,null)).status,401);
  assert.equal((await call(e,'/api/team/me',undefined,doctor)).status,403);
  const i=await invite(e,doctor,'clinician'),token=i.url.split('/').at(-1);
  assert.equal((await call(e,'/api/team/accept',{token},coord)).status,403);
  assert.equal((await call(e,'/api/team/accept',{token},doctor,()=>i.expiresAt)).status,410);
  assert.equal((await call(e,'/api/team/accept',{token},doctor)).status,200);
  assert.equal((await call(e,'/api/team/me',undefined,doctor)).body.actor.role,'clinician');
  assert.equal((await call(e,'/api/team/invite',{email:coord.email,role:'admin'},doctor)).status,403);
  await call(e,'/api/team/member',{userId:doctor.id,role:'coordinator',status:'disabled'});
  assert.equal((await call(e,'/api/team/accept',{token},doctor)).status,410);
  assert.equal((await call(e,'/api/team/member',{userId:owner.id,role:'coordinator',status:'disabled'})).status,409);
  const c=await invite(e,coord,'coordinator');await call(e,'/api/team/invite/revoke',{id:c.id});assert.equal((await call(e,'/api/team/accept',{token:c.url.split('/').at(-1)},coord)).status,410);
  const raw=JSON.stringify((await e.DB.prepare('SELECT * FROM care_invites').all()).results);assert.ok(!raw.includes(token));
 }finally{e.DB.close();}
});
test('all clinical routes enforce assignment, role and revocation even with known patient/token/outbox IDs',async()=>{
 const e=env();try{
  const p=await patient(e);await accept(e,doctor,'clinician');await accept(e,coord,'coordinator');
  const a=await link(e,p);
  for(const actor of [doctor,coord]){
   assert.equal((await call(e,'/api/care/patients',undefined,actor)).body.patients.length,0);
   assert.equal((await call(e,'/api/care/patient?id='+p.id,undefined,actor)).status,404);
   assert.equal((await call(e,'/api/care/links',{patientId:p.id,kind:'assessment'},actor)).status,404);
   assert.equal((await call(e,'/api/care/revoke',{token:a.token},actor)).status,404);
   assert.equal((await call(e,'/api/care/sms',{token:a.token,requestId:crypto.randomUUID()},actor)).status,404);
  }
  await call(e,'/api/team/assign',{patientId:p.id,userIds:[doctor.id,coord.id]});
  assert.equal((await call(e,'/api/care/patients')).body.patients.length,0); // admin has no clinical bypass
  assert.equal((await call(e,'/api/team/manage')).body.patients[0].data,undefined);
  assert.equal((await call(e,'/api/care/patients',undefined,doctor)).body.patients.length,1);
  assert.equal((await call(e,'/api/patient/submit',{token:a.token,submissionId:crypto.randomUUID(),...answer},null)).status,200);
  assert.equal((await call(e,'/api/care/plan',{patientId:p.id,...plan},coord)).status,403);
  assert.equal((await call(e,'/api/care/verification',{patientId:p.id,required:true},coord)).status,403);
  assert.equal((await call(e,'/api/care/plan',{patientId:p.id,...plan},doctor)).status,200);
  await call(e,'/api/team/member',{userId:doctor.id,role:'clinician',status:'disabled'});
  assert.equal((await call(e,'/api/care/patient?id='+p.id,undefined,doctor)).status,403);
  assert.equal((await call(e,'/api/care/patients',undefined,coord)).status,200);
 }finally{e.DB.close();}
});
test('audit records actor/time and operations without clinical answers or secrets; tied timestamps paginate completely',async()=>{
 const e=env();try{
  const p=await patient(e),a=await link(e,p);await call(e,'/api/patient/submit',{token:a.token,submissionId:crypto.randomUUID(),...answer},null);
  await call(e,'/api/care/plan',{patientId:p.id,...plan});await call(e,'/api/care/patient?id='+p.id);await call(e,'/api/team/signout',{});
  const rows=(await e.DB.prepare('SELECT * FROM care_audit').all()).results;
  assert.ok(rows.some(r=>r.action==='plan.updated'&&r.actor_id===owner.id&&r.patient_id===p.id&&r.created_at));assert.ok(rows.some(r=>r.action==='patient.viewed'));
  assert.ok(rows.some(r=>r.action==='session.signout_requested'));assert.ok(!JSON.stringify(rows).includes(a.token));assert.ok(!JSON.stringify(rows).includes(plan.text));
  const same='2026-11-05T12:00:00.000Z';for(let i=0;i<60;i++)await e.DB.prepare('INSERT INTO care_audit (id,actor_id,actor_email,action,details,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),owner.id,owner.email,'test.event','{}',same).run();
  const first=(await call(e,'/api/team/audit')).body,second=(await call(e,'/api/team/audit?before='+encodeURIComponent(first.nextBefore))).body;
  assert.equal(new Set([...first.events,...second.events].map(x=>x.id)).size,rows.length+60);
 }finally{e.DB.close();}
});
test('OTP-required forms expose no clinical context and fail closed without service configuration',async()=>{
 const e=env();try{
  const p=await patient(e),a=await link(e,p);await call(e,'/api/care/verification',{patientId:p.id,required:true});
  const opened=await call(e,'/api/patient/open',{token:a.token},null);assert.equal(opened.body.verificationRequired,true);assert.equal(opened.body.session,undefined);assert.equal(opened.body.otpAvailable,false);
  const r=await call(e,'/api/patient/submit',{token:a.token,submissionId:crypto.randomUUID(),...answer,verification:'a'.repeat(64)},null);assert.equal(r.body.code,'OTP_REQUIRED');
  let calls=0;assert.equal((await call(e,'/api/patient/otp/start',{token:a.token,challengeId:crypto.randomUUID()},null,undefined,async()=>{calls++;})).status,503);assert.equal(calls,0);
 }finally{e.DB.close();}
});
test('provider-verified OTP is token-bound, short-lived, rate-limited and rechecked at submission; no OTP stored',async()=>{
 const e=env();Object.assign(e,{TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'fixture',TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32)});
 const clock=()=> '2026-11-05T12:00:00.000Z';let sends=0,checks=0;const sid='VE'+'c'.repeat(32),code='123456';
 const provider=async(url,opts)=>{const form=new URLSearchParams(opts.body);if(url.endsWith('/Verifications')){sends++;return Response.json({sid,status:'pending'});}checks++;assert.equal(form.get('VerificationSid'),sid);return Response.json({sid,status:form.get('Code')===code?'approved':'pending'});};
 try{
  const p=await patient(e),a=await link(e,p);await call(e,'/api/care/verification',{patientId:p.id,required:true});const challengeId=crypto.randomUUID();
  assert.equal((await call(e,'/api/patient/otp/start',{token:a.token,challengeId},null,clock,provider)).status,200);
  await call(e,'/api/patient/otp/start',{token:a.token,challengeId},null,clock,provider);assert.equal(sends,1);
  assert.equal((await call(e,'/api/patient/otp/start',{token:a.token,challengeId:crypto.randomUUID()},null,clock,provider)).status,429);
  const verified=await call(e,'/api/patient/otp/check',{token:a.token,challengeId,code},null,clock,provider);assert.equal(verified.status,200);assert.equal(checks,1);
  const verification=verified.body.verification;assert.equal((await call(e,'/api/patient/open',{token:a.token,verification},null,clock)).body.session.name,'Fictional');
  const expired=await call(e,'/api/patient/submit',{token:a.token,verification,submissionId:crypto.randomUUID(),...answer},null,()=> '2026-11-05T12:10:00.000Z');assert.equal(expired.body.code,'OTP_REQUIRED');
  await call(e,'/api/care/verification',{patientId:p.id,required:false});await call(e,'/api/care/verification',{patientId:p.id,required:true});
  assert.equal((await call(e,'/api/patient/open',{token:a.token,verification},null,clock)).body.code,'OTP_REQUIRED');
  const raw=JSON.stringify((await e.DB.prepare('SELECT * FROM care_otp_challenges').all()).results);assert.ok(!raw.includes(verification));assert.ok(!raw.includes(code));
 }finally{e.DB.close();}
});
test('OTP checking stops after five bad attempts and an approval cannot be reused on another form',async()=>{
 const e=env();Object.assign(e,{TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'fixture',TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32)});let checks=0;const sid='VE'+'c'.repeat(32);const provider=async(url)=>{if(url.endsWith('/Verifications'))return Response.json({sid,status:'pending'});checks++;return Response.json({sid,status:'pending'});};
 try{
  const p=await patient(e),a=await link(e,p);await call(e,'/api/care/verification',{patientId:p.id,required:true});const challengeId=crypto.randomUUID();
  await call(e,'/api/patient/otp/start',{token:a.token,challengeId},null,undefined,provider);
  for(let i=0;i<5;i++)assert.equal((await call(e,'/api/patient/otp/check',{token:a.token,challengeId,code:'999999'},null,undefined,provider)).status,400);
  assert.equal((await call(e,'/api/patient/otp/check',{token:a.token,challengeId,code:'999999'},null,undefined,provider)).status,429);assert.equal(checks,5);
  const p2=await patient(e),a2=await link(e,p2);await call(e,'/api/care/verification',{patientId:p2.id,required:true});
  assert.equal((await call(e,'/api/patient/otp/check',{token:a2.token,challengeId,code:'999999'},null,undefined,provider)).status,410);assert.equal(checks,5);
 }finally{e.DB.close();}
});
test('legacy patient assignment initializes once; removing owner access never silently restores it',async()=>{
 const e=env();try{
  const id=crypto.randomUUID(),now=new Date().toISOString();await e.DB.prepare('INSERT INTO care_patients (id,data,created_at,updated_at) VALUES (?,?,?,?)').bind(id,JSON.stringify({id,name:'Legacy Fictional',phone:e.SMS_TEST_TO}),now,now).run();
  assert.equal((await call(e,'/api/care/patients')).body.patients.length,1);await accept(e,doctor,'clinician');await call(e,'/api/team/assign',{patientId:id,userIds:[doctor.id]});
  assert.equal((await call(e,'/api/care/patients')).body.patients.length,0);assert.equal((await call(e,'/api/care/patients')).body.patients.length,0);
  assert.equal((await call(e,'/api/care/patient?id='+id,undefined,doctor)).status,200);
 }finally{e.DB.close();}
});
