import { handleCare } from './care.js'; // @build-care-module
// Sites Worker ESM: the build injects compiled React assets into this module.
// All SMS credentials and the allowed recipient are server-side environment values.
const APP_ASSETS = null; // @build-assets
const TEST_TEXT = 'KTx-CONNECT technical test. SMS integration is working. No patient information is included.';
const attempts = new Map();
const latestAttemptByOwner = new Map();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SID = /^SM[0-9a-f]{32}$/i;
const E164 = /^\+[1-9]\d{7,14}$/;
const NO_STORE = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: NO_STORE });
function configured(env) {
  const required = ['SMS_ADMIN_EMAIL','SMS_TEST_TO','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN'];
  const missing = required.filter(key => !env[key]?.trim());
  if (!env.TWILIO_FROM_NUMBER?.trim() && !env.TWILIO_MESSAGING_SERVICE_SID?.trim()) missing.push('TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID');
  if (env.TWILIO_ACCOUNT_SID && !/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID)) missing.push('valid TWILIO_ACCOUNT_SID');
  if (env.SMS_TEST_TO && !E164.test(env.SMS_TEST_TO)) missing.push('valid SMS_TEST_TO (E.164)');
  if (env.TWILIO_FROM_NUMBER && !E164.test(env.TWILIO_FROM_NUMBER)) missing.push('valid TWILIO_FROM_NUMBER (E.164)');
  if (env.TWILIO_MESSAGING_SERVICE_SID && !/^MG[0-9a-f]{32}$/i.test(env.TWILIO_MESSAGING_SERVICE_SID)) missing.push('valid TWILIO_MESSAGING_SERVICE_SID');
  if (env.TWILIO_TRIAL_TEMPLATE && env.TWILIO_TRIAL_TEMPLATE !== 'sms_internal_alerts') missing.push('supported TWILIO_TRIAL_TEMPLATE');
  if (env.TWILIO_TRIAL_TEMPLATE && !env.TWILIO_FROM_NUMBER?.trim()) missing.push('TWILIO_FROM_NUMBER assigned to this recipient in Twilio Trial');
  return missing;
}
function authorize(request, env) {
  const email = request.headers.get('oai-authenticated-user-email');
  if (!email) return json({ ok:false, code:'SIGN_IN_REQUIRED', error:'Sign in with ChatGPT to use the owner-only SMS test.', signInUrl:'/signin-with-chatgpt?return_to=%2F%23%2Fsettings' },401);
  if (!env.SMS_ADMIN_EMAIL || email.trim().toLowerCase() !== env.SMS_ADMIN_EMAIL.trim().toLowerCase()) return json({ ok:false, code:'OWNER_ONLY', error:'Real SMS testing is available only to the configured site owner.' },403);
  return null;
}
function mask(number) { return number ? `••• ••• ${number.slice(-4)}` : 'Not configured'; }
function providerHeaders(env) { return { 'Authorization':`Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`, 'Content-Type':'application/x-www-form-urlencoded' }; }
function base(env) { return `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages`; }
function receipt(body, requestId, env) { return { ok:true, requestId, sid:body.sid, status:body.status, recipient:mask(env.SMS_TEST_TO), delivered:body.status==='delivered', providerCode:body.error_code||null, checkedAt:new Date().toISOString() }; }
const providerFailure = body => ({ ok:false, code:'PROVIDER_REJECTED', providerCode:Number.isInteger(body?.code)?body.code:null, error:'Twilio rejected the request. Check your sender, account permissions, balance, and trial recipient verification in the Twilio Console. No automatic retry was made.' });

export async function handleSms(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const denied = authorize(request,env); if (denied) return denied;
  const missing = configured(env);
  if (url.pathname === '/api/sms/status' && request.method === 'GET') return json({ ok:true, configured:missing.length===0, missing:[...new Set(missing)], provider:'Twilio', recipient:mask(env.SMS_TEST_TO), mode:env.TWILIO_TRIAL_TEMPLATE?'trial-template':'custom', message:env.TWILIO_TRIAL_TEMPLATE?'Twilio Trial template: Internal alerts. Twilio supplies the message text; this trial does not allow custom content.':TEST_TEXT, persistence:'local-demo-only', limitations:'The test sends a generic message only. Demo patient links do not synchronize to another device.' });
  if (!['/api/sms/test','/api/sms/receipt'].includes(url.pathname)) return json({ok:false,error:'Unknown SMS endpoint.'},404);
  if (missing.length) return json({ ok:false, code:'SMS_NOT_CONFIGURED', error:'SMS provider credentials are not configured. No message was sent.', missing },503);
  if (url.pathname === '/api/sms/receipt') {
    if (request.method !== 'GET') return json({ok:false,error:'Use GET for delivery status.'},405);
    const sid=url.searchParams.get('sid'); const requestId=url.searchParams.get('requestId');
    if ((!sid||!SID.test(sid)) && (!requestId||!UUID.test(requestId))) return json({ok:false,error:'A valid message SID or request reference is required.'},400);
    if (env.TWILIO_TRIAL_TEMPLATE && (!sid || !SID.test(sid))) return json({ok:false,code:'TRIAL_SID_REQUIRED',error:'Trial templates cannot include a request reference. Check Twilio message logs for the SID before retrying an uncertain send.'},400);
    try {
      const endpoint=sid&&SID.test(sid)?`${base(env)}/${sid}.json`:`${base(env)}.json?${new URLSearchParams({To:env.SMS_TEST_TO,PageSize:'50'})}`;
      const r=await fetcher(endpoint,{headers:providerHeaders(env),signal:AbortSignal.timeout(12000)});
      const b=await r.json(); if (!r.ok) return json(providerFailure(b),502);
      const found=sid?b:b.messages?.find(m=>m.body===`${TEST_TEXT} Ref: ${requestId}`);
      if (!found) return json({ok:false,code:'NOT_FOUND_YET',error:'No matching provider record was found yet. This does not establish that no message was sent. Check Twilio logs before trying another send.'},404);
      if(found.to!==env.SMS_TEST_TO||(env.TWILIO_TRIAL_TEMPLATE?found.from!==env.TWILIO_FROM_NUMBER:!found.body?.startsWith(TEST_TEXT))) return json({ok:false,error:'This is not an authorized test message.'},403);
      return json(receipt(found,requestId,env));
    } catch { return json({ok:false,code:'STATUS_UNAVAILABLE',error:'Delivery status could not be checked. No new SMS was sent.'},502); }
  }
  if(request.method!=='POST')return json({ok:false,error:'Sending requires an explicit POST.'},405);
  if(request.headers.get('origin')!==url.origin)return json({ok:false,error:'The request must come from this app.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({ok:false,error:'JSON required.'},415);
  const raw=await request.text();if(raw.length>512)return json({ok:false,error:'Request too large.'},413);
  let input;try{input=JSON.parse(raw);}catch{return json({ok:false,error:'Invalid JSON.'},400);}
  if(!input||Object.keys(input).some(k=>k!=='requestId')||!UUID.test(input.requestId||''))return json({ok:false,error:'Only a valid request reference is accepted. The server controls the recipient and message.'},400);
  const owner=request.headers.get('oai-authenticated-user-email').toLowerCase();const key=`${owner}:${input.requestId}`;
  if(attempts.has(key))return json(await attempts.get(key),200);
  const now=Date.now();if(now-(latestAttemptByOwner.get(owner)||0)<60000)return json({ok:false,code:'RATE_LIMITED',error:'Wait one minute before starting a different test. Check the existing receipt instead.'},429);
  // This bounded demo guard is per Worker isolate. It is not a distributed exactly-once guarantee.
  // A transport error is retained as uncertain; it must never trigger an automatic resend.
  if(attempts.size>=250)return json({ok:false,code:'RATE_LIMITED',error:'Demo attempt limit reached. No message was sent.'},429);
  latestAttemptByOwner.set(owner,now);
  const attempt=(async()=>{
    const form=new URLSearchParams({To:env.SMS_TEST_TO,Body:env.TWILIO_TRIAL_TEMPLATE||`${TEST_TEXT} Ref: ${input.requestId}`});
    if(env.TWILIO_MESSAGING_SERVICE_SID&&!env.TWILIO_TRIAL_TEMPLATE)form.set('MessagingServiceSid',env.TWILIO_MESSAGING_SERVICE_SID);else form.set('From',env.TWILIO_FROM_NUMBER);
    try {
      const r=await fetcher(`${base(env)}.json`,{method:'POST',headers:providerHeaders(env),body:form,signal:AbortSignal.timeout(12000)});
      let b;try{b=await r.json();}catch{return {ok:false,code:'DELIVERY_UNKNOWN',requestId:input.requestId,error:'The provider response could not be read. Do not resend automatically; check the provider logs or receipt.'};}
      if(!r.ok)return providerFailure(b);
      if(!SID.test(b.sid||'')||typeof b.status!=='string')return {ok:false,code:'DELIVERY_UNKNOWN',requestId:input.requestId,error:'The provider response was incomplete. Check the provider logs before retrying.'};
      return receipt(b,input.requestId,env);
    }catch{return {ok:false,code:'DELIVERY_UNKNOWN',requestId:input.requestId,error:'The connection ended before an outcome was confirmed. A message may already have been accepted. Check status before another attempt.'};}
  })();
  attempts.set(key,attempt);const result=await attempt;
  return json(result,result.ok?202:result.code==='DELIVERY_UNKNOWN'?504:502);
}

export default {
  async fetch(request,env,ctx) {
    void ctx;
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/care/')||url.pathname.startsWith('/api/patient/'))return handleCare(request,env);
    if(url.pathname.startsWith('/api/sms/'))return handleSms(request,env);
    if(url.pathname.startsWith('/api/'))return json({ok:false,error:'Not found.'},404);
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
    const asset=APP_ASSETS?.[url.pathname==='/'?'/index.html':url.pathname];
    if(!asset)return new Response('Not found',{status:404});
    const headers={'content-type':asset.type,'cache-control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache','x-content-type-options':'nosniff'};
    if(url.pathname==='/sw.js')headers['service-worker-allowed']='/';
    const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
    return new Response(request.method==='HEAD'?null:bytes,{headers});
  }
};
