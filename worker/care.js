const careHeaders={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const careJson=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:careHeaders});
const careUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const careTokenPattern=/^[0-9a-f]{64}$/;
const careBarrierIds=['forget','routine','taste','swallow','effects','other'];
const careStrategyIds=['reminder','routine','cue','support','team'];
function careFail(message,status=400,code='INVALID_REQUEST'){const e=new Error(message);e.status=status;e.code=code;throw e;}
function careText(value,max=1000){return typeof value==='string'?value.trim().slice(0,max):'';}
function careArray(value,allowed){if(!Array.isArray(value)||value.length>allowed.length||value.some(v=>!allowed.includes(v)))careFail('Invalid selection.');return [...new Set(value)];}
function careOwner(request,env){const email=request.headers.get('oai-authenticated-user-email');if(!email)careFail('Sign in with ChatGPT to open the care team workspace.',401,'SIGN_IN_REQUIRED');if(!env.SMS_ADMIN_EMAIL||email.toLowerCase().trim()!==env.SMS_ADMIN_EMAIL.toLowerCase().trim())careFail('This workspace is available only to the configured care team owner.',403,'OWNER_ONLY');}
async function careInput(request){if(request.headers.get('origin')!==new URL(request.url).origin)careFail('Open this form from the app.',403,'ORIGIN_REQUIRED');if(!request.headers.get('content-type')?.startsWith('application/json'))careFail('JSON required.',415);const raw=await request.text();if(raw.length>16000)careFail('Request too large.',413);try{const input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input))careFail('Invalid request.');return input;}catch(e){if(e.status)throw e;careFail('Invalid JSON.');}}
export async function careHash(token){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');}
function careRandomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');}
function careDb(env){if(!env.DB?.prepare)careFail('Shared storage is not connected yet. Please try again after deployment.',503,'DATABASE_UNAVAILABLE');return env.DB;}
async function careGetPatient(db,id){if(!careUuid.test(id||''))careFail('Patient not found.',404,'NOT_FOUND');const row=await db.prepare('SELECT id,data,revision FROM care_patients WHERE id=?').bind(id).first();if(!row)careFail('Patient not found.',404,'NOT_FOUND');return {...row,patient:JSON.parse(row.data)};}
function careOwnerView(row){const p=row.patient||JSON.parse(row.data);return {...p,phone:`••• ••• ${p.phone.slice(-4)}`,revision:row.revision};}
async function careResolveToken(db,raw,now,allowUsed=false){if(!careTokenPattern.test(raw||''))careFail('This link is not available.',404,'LINK_INVALID');const hash=await careHash(raw);const token=await db.prepare('SELECT * FROM care_tokens WHERE hash=?').bind(hash).first();if(!token)careFail('This link is not available.',404,'LINK_INVALID');if(token.revoked_at)careFail('A newer link replaced this form. Ask your care team for the latest link.',410,'LINK_REVOKED');if(token.used_at&&!allowUsed)careFail('This response has already been shared. Thank you.',410,'LINK_USED');if(token.expires_at<=now)careFail('This link has expired. Ask your care team for a new link.',410,'LINK_EXPIRED');return token;}
async function careUpdatePatient(db,row,patient,now){const r=await db.prepare('UPDATE care_patients SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(JSON.stringify(patient),now,row.id,row.revision).run();if(r.meta?.changes!==1)careFail('This record changed. Refresh and try again.',409,'RECORD_CHANGED');}
function carePatientView(p,kind){return {name:p.name.split(' ')[0],barriers:p.barriers,other:p.other,primary:p.primary,preferences:p.preferences,assessedAt:p.assessedAt||null,plan:p.plan?{text:p.plan.text,reminderTime:p.plan.reminderTime}:null,kind};}
function careLinkPolicy(env){return {smsAvailable:!env.TWILIO_TRIAL_TEMPLATE&&!!env.TWILIO_ACCOUNT_SID&&!!env.TWILIO_AUTH_TOKEN&&!!(env.TWILIO_FROM_NUMBER||env.TWILIO_MESSAGING_SERVICE_SID),smsReason:env.TWILIO_TRIAL_TEMPLATE?'Twilio Trial allows fixed templates, so it cannot send this custom link. The link itself works: copy it or open it on another device. Enable custom SMS on the provider account to send it by SMS.':'Custom link SMS requires an enabled provider and sender.'};}

export async function handleCare(request,env,fetcher=fetch,clock=()=>new Date().toISOString()){
 try{
  const url=new URL(request.url);const now=clock();const patientRoute=url.pathname.startsWith('/api/patient/');
  if(!patientRoute)careOwner(request,env);
  const db=careDb(env);
  if(url.pathname==='/api/care/patients'&&request.method==='GET'){
    const rows=await db.prepare('SELECT id,data,revision FROM care_patients ORDER BY updated_at DESC LIMIT 100').all();
    return careJson({ok:true,patients:rows.results.map(careOwnerView),now,...careLinkPolicy(env)});
  }
  if(url.pathname==='/api/care/patient'&&request.method==='GET')return careJson({ok:true,patient:careOwnerView(await careGetPatient(db,url.searchParams.get('id'))),now});
  if(request.method!=='POST')careFail('This action requires POST.',405);
  const input=await careInput(request);
  if(url.pathname==='/api/care/patients'){
    const name=careText(input.name,80);if(!name)careFail('Enter a display name.');
    const phone=careText(input.phone||env.SMS_TEST_TO,20);if(!/^\+[1-9]\d{7,14}$/.test(phone))careFail('A valid phone number in international format is required.');
    const id=crypto.randomUUID();const patient={id,name,initials:name.split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase(),dob:'',phone,enrolledAt:now,barriers:[],other:'',primary:'',preferences:[],checkIns:[]};
    await db.prepare('INSERT INTO care_patients (id,data,revision,created_at,updated_at) VALUES (?,?,0,?,?)').bind(id,JSON.stringify(patient),now,now).run();
    return careJson({ok:true,patient:careOwnerView({patient,revision:0}),now},201);
  }
  if(url.pathname==='/api/care/plan'){
    const row=await careGetPatient(db,input.patientId);if(!row.patient.assessedAt)careFail('Complete the patient assessment before agreeing on a plan.');
    const text=careText(input.text,2000);if(!text)careFail('Write the agreed plan.');
    const reminderTime=careText(input.reminderTime,5);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime))careFail('Choose a valid preferred time.');
    const strategies=careArray(input.strategies||[],careStrategyIds);const nextCheckIn=new Date(Date.parse(now)+7*86400000).toISOString();
    const patient={...row.patient,plan:{text,strategies,reminderTime,at:now,nextCheckIn}};await careUpdatePatient(db,row,patient,now);
    return careJson({ok:true,patient:careOwnerView({patient,revision:row.revision+1}),now});
  }
  if(url.pathname==='/api/care/links'){
    const row=await careGetPatient(db,input.patientId);const kind=input.kind;if(!['assessment','checkin'].includes(kind))careFail('Choose assessment or check-in.');
    if(kind==='checkin'&&!row.patient.plan)careFail('Save an agreed plan before creating a check-in.');
    const raw=careRandomToken();const hash=await careHash(raw);const expiresAt=new Date(Date.parse(now)+72*3600000).toISOString();
    await db.batch([
      db.prepare('UPDATE care_tokens SET revoked_at=? WHERE patient_id=? AND kind=? AND used_at IS NULL AND revoked_at IS NULL').bind(now,row.id,kind),
      db.prepare('INSERT INTO care_tokens (hash,patient_id,kind,created_at,expires_at) VALUES (?,?,?,?,?)').bind(hash,row.id,kind,now,expiresAt),
    ]);
    return careJson({ok:true,link:{token:raw,url:`${url.origin}/#/access/${raw}`,patientId:row.id,kind,expiresAt},...careLinkPolicy(env)},201);
  }
  if(url.pathname==='/api/care/revoke'){
    const hash=await careHash(careText(input.token,64));await db.prepare('UPDATE care_tokens SET revoked_at=? WHERE hash=? AND used_at IS NULL').bind(now,hash).run();return careJson({ok:true});
  }
  if(url.pathname==='/api/patient/open'){
    const token=await careResolveToken(db,input.token,now);const row=await careGetPatient(db,token.patient_id);
    return careJson({ok:true,session:carePatientView(row.patient,token.kind),expiresAt:token.expires_at});
  }
  if(url.pathname==='/api/patient/submit'){
    if(!careUuid.test(input.submissionId||''))careFail('A valid response reference is required.');
    const token=await careResolveToken(db,input.token,now,true);
    if(token.used_at){if(token.submission_id===input.submissionId)return careJson({ok:true,alreadySaved:true});careFail('This response has already been shared. Thank you.',410,'LINK_USED');}
    const row=await careGetPatient(db,token.patient_id);const patient=structuredClone(row.patient);
    if(token.kind==='assessment'){
      const barriers=careArray(input.barriers,careBarrierIds);const primary=input.primary;const other=careText(input.other,500);const preferences=careArray(input.preferences||[],careStrategyIds);
      if(!barriers.length||!barriers.includes(primary))careFail('Choose at least one barrier and your main focus.');if(barriers.includes('other')&&!other)careFail('Describe what is getting in the way.');
      Object.assign(patient,{barriers,primary,other,preferences,assessedAt:now});
    }else{
      if(!patient.plan)careFail('An agreed plan is needed before a check-in.');if(!['green','yellow','red'].includes(input.rating))careFail('Choose how things are going.');
      patient.checkIns.push({id:input.submissionId,at:now,rating:input.rating,note:careText(input.note,1000)});patient.plan.nextCheckIn=new Date(Date.parse(now)+7*86400000).toISOString();
    }
    const result=await db.batch([
      db.prepare('UPDATE care_patients SET data=?,revision=revision+1,last_submission_id=?,updated_at=? WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM care_tokens WHERE hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?)').bind(JSON.stringify(patient),input.submissionId,now,row.id,row.revision,token.hash,now),
      db.prepare('UPDATE care_tokens SET used_at=?,submission_id=? WHERE hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS (SELECT 1 FROM care_patients WHERE id=? AND last_submission_id=?)').bind(now,input.submissionId,token.hash,now,row.id,input.submissionId),
    ]);
    if(result[0].meta?.changes!==1||result[1].meta?.changes!==1)careFail('This form changed while saving. Refresh before trying again.',409,'RECORD_CHANGED');
    return careJson({ok:true,savedAt:now});
  }
  if(url.pathname==='/api/care/sms'){
    if(!careUuid.test(input.requestId||''))careFail('A valid send reference is required.');
    const token=await careResolveToken(db,input.token,now);const row=await careGetPatient(db,token.patient_id);
    if(env.TWILIO_TRIAL_TEMPLATE)careFail('Twilio Trial does not allow custom messages containing this link. Copy the working patient link, or enable custom SMS with your provider. No SMS was sent.',409,'TRIAL_CUSTOM_SMS_BLOCKED');
    if(!careLinkPolicy(env).smsAvailable)careFail('Custom SMS is not configured. No message was sent.',503,'SMS_NOT_CONFIGURED');
    if(row.patient.phone!==env.SMS_TEST_TO)careFail('SMS sending is restricted to the test recipient authorized for this prototype.',403,'RECIPIENT_NOT_ALLOWED');
    const existing=await db.prepare('SELECT * FROM care_outbox WHERE id=?').bind(input.requestId).first();
    if(existing){if(existing.token_hash!==token.hash)careFail('This send reference belongs to another request.',409);return careJson({ok:true,outbox:existing,reused:true});}
    const reserve=await db.prepare('INSERT INTO care_outbox (id,patient_id,token_hash,status,created_at,updated_at) VALUES (?,?,?,\'sending\',?,?) ON CONFLICT(id) DO NOTHING').bind(input.requestId,row.id,token.hash,now,now).run();
    if(reserve.meta?.changes!==1)careFail('This send is already in progress. Check status instead of resending.',409,'SEND_IN_PROGRESS');
    const link=`${url.origin}/#/access/${input.token}`;const form=new URLSearchParams({To:row.patient.phone,Body:`KTx-CONNECT: Your requested form is ready. Open: ${link}`});
    if(env.TWILIO_MESSAGING_SERVICE_SID)form.set('MessagingServiceSid',env.TWILIO_MESSAGING_SERVICE_SID);else form.set('From',env.TWILIO_FROM_NUMBER);
    let status='unknown',sid=null,providerCode=null;
    try{
      const response=await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(12000)});
      const body=await response.json();if(response.ok&&/^SM[0-9a-f]{32}$/i.test(body.sid||'')){status=body.status;sid=body.sid;}else{status='rejected';providerCode=Number.isInteger(body.code)?body.code:null;}
    }catch{/* The provider may have accepted an uncertain request. Do not retry. */}
    await db.prepare('UPDATE care_outbox SET status=?,provider_sid=?,provider_code=?,updated_at=? WHERE id=?').bind(status,sid,providerCode,now,input.requestId).run();
    const outbox=await db.prepare('SELECT * FROM care_outbox WHERE id=?').bind(input.requestId).first();return careJson({ok:!!sid,outbox,error:sid?null:status==='unknown'?'Outcome uncertain. Check provider logs before another send.':'Provider rejected the message.'},sid?202:502);
  }
  if(url.pathname==='/api/care/sms/status'){
    const outbox=await db.prepare('SELECT * FROM care_outbox WHERE id=?').bind(careText(input.id,50)).first();if(!outbox)careFail('Message not found.',404);if(!outbox.provider_sid)return careJson({ok:true,outbox});
    try{const response=await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages/${outbox.provider_sid}.json`,{headers:{Authorization:`Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`},signal:AbortSignal.timeout(12000)});const body=await response.json();if(!response.ok)careFail('Provider status unavailable.',502);await db.prepare('UPDATE care_outbox SET status=?,provider_code=?,updated_at=? WHERE id=?').bind(body.status,body.error_code||null,now,outbox.id).run();return careJson({ok:true,outbox:{...outbox,status:body.status,provider_code:body.error_code||null}});}catch{careFail('Could not check delivery status. No message was sent.',502);}
  }
  careFail('Not found.',404,'NOT_FOUND');
 }catch(e){return careJson({ok:false,code:e.code||'SERVER_ERROR',error:e.status?e.message:'The shared workspace could not complete this request. Please try again.',...(e.code==='SIGN_IN_REQUIRED'?{signInUrl:'/signin-with-chatgpt?return_to=%2F%23%2Fshared'}:{})},e.status||503);}
}
