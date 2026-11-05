import {teamAudit,teamAuditStatement,teamDigest,teamRandom,teamFail,teamUuid} from './team.js';
export function otpPolicy(env){return {otpAvailable:!!env.TWILIO_ACCOUNT_SID&&!!env.TWILIO_AUTH_TOKEN&&/^VA[a-f0-9]{32}$/i.test(env.TWILIO_VERIFY_SERVICE_SID||''),otpReason:'SMS verification needs a configured Twilio Verify service. Contact your care team if verification is unavailable.'};}
export async function otpPermit(db,token,input,now){
 if(!/^[a-f0-9]{64}$/.test(input.verification||''))teamFail('Verify your phone before opening this form.',403,'OTP_REQUIRED');
 const row=await db.prepare("SELECT id FROM care_otp_challenges WHERE token_hash=? AND verification_hash=? AND status='verified' AND verified_until>? AND expires_at>?").bind(token.hash,await teamDigest(input.verification),now,now).first();
 if(!row)teamFail('Phone verification expired. Verify your phone again.',403,'OTP_REQUIRED');
}
export async function handleOtp(db,env,token,patient,input,path,now,fetcher){
 const actor={id:`patient:${token.patient_id}`,email:''};
 if(!patient.otpRequired)teamFail('Phone verification is not required for this form.',409);
 if(!otpPolicy(env).otpAvailable)teamFail('SMS verification is not configured. Ask your care team for help. Your form remains locked.',503,'OTP_NOT_CONFIGURED');
 if(patient.patient.phone!==env.SMS_TEST_TO)teamFail('Verification is restricted to the authorized test phone number.',403,'RECIPIENT_NOT_ALLOWED');
 const service=`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}`;
 const headers={Authorization:`Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,'Content-Type':'application/x-www-form-urlencoded'};
 if(path==='/api/patient/otp/start'){
  if(!teamUuid.test(input.challengeId||''))teamFail('A valid request reference is required.');
  const existing=await db.prepare('SELECT * FROM care_otp_challenges WHERE id=?').bind(input.challengeId).first();
  if(existing){if(existing.token_hash!==token.hash)teamFail('Request reference does not match this link.',409);return {ok:existing.status==='sent',challengeId:existing.id,status:existing.status,error:existing.status==='sent'?null:'The send outcome is uncertain or unavailable. Do not retry automatically.'};}
  const expiresAt=new Date(Math.min(Date.parse(now)+10*60000,Date.parse(token.expires_at))).toISOString(),minute=new Date(Date.parse(now)-60000).toISOString(),hour=new Date(Date.parse(now)-3600000).toISOString();
  const reserved=await db.prepare("INSERT INTO care_otp_challenges (id,token_hash,patient_id,status,created_at,expires_at) SELECT ?,?,?,'sending',?,? WHERE NOT EXISTS (SELECT 1 FROM care_otp_challenges WHERE patient_id=? AND created_at>?) AND (SELECT COUNT(*) FROM care_otp_challenges WHERE patient_id=? AND created_at>?)<5").bind(input.challengeId,token.hash,token.patient_id,now,expiresAt,token.patient_id,minute,token.patient_id,hour).run();
  if(reserved.meta?.changes!==1)teamFail('Wait before requesting another code. At most five sends per hour are allowed.',429,'RATE_LIMITED');
  await teamAudit(db,actor,'otp.send_requested',token.patient_id,{},now);
  let status='unknown',sid=null;
  try{const r=await fetcher(`${service}/Verifications`,{method:'POST',headers,body:new URLSearchParams({To:patient.patient.phone,Channel:'sms'}),signal:AbortSignal.timeout(12000)});const b=await r.json();if(r.ok&&/^VE[a-f0-9]{32}$/i.test(b.sid||'')&&b.status==='pending'){status='sent';sid=b.sid;}else status='rejected';}catch{/* Never automatically retry an uncertain provider request. */}
  await db.batch([db.prepare('UPDATE care_otp_challenges SET status=?,provider_sid=? WHERE id=?').bind(status,sid,input.challengeId),teamAuditStatement(db,actor,'otp.send_result',token.patient_id,{status},now)]);
  return {ok:status==='sent',challengeId:input.challengeId,status,error:status==='sent'?null:'The code could not be confirmed as sent. Contact your care team; no automatic retry was made.'};
 }
 if(path==='/api/patient/otp/check'){
  if(!teamUuid.test(input.challengeId||'')||!/^\d{4,10}$/.test(input.code||''))teamFail('Enter the code from your text message.');
  const c=await db.prepare('SELECT * FROM care_otp_challenges WHERE id=? AND token_hash=?').bind(input.challengeId,token.hash).first();
  if(!c||c.status!=='sent'||c.expires_at<=now)teamFail('This verification is unavailable or expired. Request a new code.',410,'OTP_EXPIRED');
  const slot=await db.prepare("UPDATE care_otp_challenges SET attempts=attempts+1 WHERE id=? AND status='sent' AND attempts<5 AND expires_at>?").bind(c.id,now).run();
  if(slot.meta?.changes!==1)teamFail('Too many checks. Request a new code after the cooldown.',429,'OTP_ATTEMPTS');
  let approved=false;
  try{const r=await fetcher(`${service}/VerificationCheck`,{method:'POST',headers,body:new URLSearchParams({VerificationSid:c.provider_sid,Code:input.code}),signal:AbortSignal.timeout(12000)});const b=await r.json();approved=r.ok&&b.status==='approved'&&b.sid===c.provider_sid;}catch{teamFail('The code could not be checked. Please try again.',503,'OTP_CHECK_UNAVAILABLE');}
  if(!approved){await teamAudit(db,actor,'otp.check_failed',token.patient_id,{},now);teamFail('The code was not accepted. Check it and try again.',400,'OTP_INVALID');}
  const verification=teamRandom(),until=new Date(Math.min(Date.parse(now)+15*60000,Date.parse(token.expires_at),Date.parse(c.expires_at))).toISOString();
  const result=await db.batch([db.prepare("UPDATE care_otp_challenges SET status='verified',verification_hash=?,verified_until=? WHERE id=? AND status='sent' AND expires_at>?").bind(await teamDigest(verification),until,c.id,now),teamAuditStatement(db,actor,'otp.verified',token.patient_id,{},now)]);
  if(result[0].meta?.changes!==1)teamFail('Verification changed. Please request a new code.',409);
  return {ok:true,verification,expiresAt:until};
 }
 teamFail('Unknown verification action.',404);
}
