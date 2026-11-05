// Sites supplies authenticated identity. Membership and assignments are enforced here.
export const teamJson=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
export function teamFail(message,status=400,code='INVALID_REQUEST'){throw Object.assign(new Error(message),{status,code});}
export const teamUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const teamRandom=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export const teamDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
export async function teamInput(request){
 if(request.headers.get('origin')!==new URL(request.url).origin)teamFail('Open this action from the app.',403,'ORIGIN_REQUIRED');
 if(!request.headers.get('content-type')?.startsWith('application/json'))teamFail('JSON required.',415);
 const raw=await request.text();if(raw.length>16000)teamFail('Request too large.',413);
 try{const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))teamFail('Invalid request.');return b;}catch(e){if(e.status)throw e;teamFail('Invalid JSON.');}
}
export function teamError(e){return teamJson({ok:false,code:e.code||'SERVER_ERROR',error:e.status?e.message:'The request could not be completed. Please try again.',...(e.code==='SIGN_IN_REQUIRED'?{signInUrl:'/signin-with-chatgpt?return_to=%2F%23%2Fshared'}:{})},e.status||503);}
export function teamIdentity(request){
 const id=request.headers.get('oai-authenticated-user-id');const email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
 if(!id||!email)teamFail('Sign in with ChatGPT to open the care team workspace.',401,'SIGN_IN_REQUIRED');
 return {id,email};
}
export function teamAuditStatement(db,actor,action,patientId=null,details={},now=new Date().toISOString()){
 // Callers supply bounded operational metadata, never form answers, tokens or OTPs.
 return db.prepare('INSERT INTO care_audit (id,actor_id,actor_email,action,patient_id,details,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,actor.email||'',action,patientId,JSON.stringify(details),now);
}
export function teamMutationAudit(db,actor,action,patientId,mutationId,details,now){
 return db.prepare('INSERT INTO care_audit (id,actor_id,actor_email,action,patient_id,details,created_at) SELECT ?,?,?,?,?,?,? FROM care_patients WHERE id=? AND last_submission_id=?').bind(crypto.randomUUID(),actor.id,actor.email||'',action,patientId,JSON.stringify(details),now,patientId,mutationId);
}
export async function teamAudit(db,actor,action,patientId=null,details={},now){await teamAuditStatement(db,actor,action,patientId,details,now).run();}
export async function teamActor(request,env,now=new Date().toISOString()){
 const identity=teamIdentity(request);const db=env.DB;if(!db?.prepare)teamFail('Shared storage is unavailable.',503);
 let member=await db.prepare('SELECT * FROM care_members WHERE user_id=?').bind(identity.id).first();
 if(!member&&identity.email===env.SMS_ADMIN_EMAIL?.trim().toLowerCase()){
  // The configured owner bootstraps exactly once. Legacy patient assignment happens
  // in this audited transaction, outside schema migrations. A marker prevents reuse.
  await db.batch([
   db.prepare("INSERT INTO care_workspace (id,owner_id) VALUES ('main',?) ON CONFLICT(id) DO NOTHING").bind(identity.id),
   db.prepare("INSERT INTO care_members (user_id,email,role,status,joined_at) SELECT ?,?,'admin','active',? WHERE EXISTS (SELECT 1 FROM care_workspace WHERE id='main' AND owner_id=?) ON CONFLICT(user_id) DO NOTHING").bind(identity.id,identity.email,now,identity.id),
   db.prepare("INSERT INTO care_assignments (patient_id,user_id,assigned_at) SELECT id,?,? FROM care_patients WHERE created_by IS NULL AND EXISTS (SELECT 1 FROM care_members WHERE user_id=? AND status='active') ON CONFLICT(patient_id,user_id) DO NOTHING").bind(identity.id,now,identity.id),
   db.prepare("UPDATE care_patients SET created_by=? WHERE created_by IS NULL AND EXISTS (SELECT 1 FROM care_members WHERE user_id=? AND status='active')").bind(identity.id,identity.id),
   teamAuditStatement(db,identity,'workspace.bootstrap',null,{},now),
  ]);
  member=await db.prepare('SELECT * FROM care_members WHERE user_id=?').bind(identity.id).first();
 }
 if(!member||member.status!=='active')teamFail('Your account does not have active team membership. Ask an admin for an invitation.',403,'MEMBERSHIP_REQUIRED');
 return {id:member.user_id,email:member.email,role:member.role};
}
export function teamRole(actor,roles){if(!roles.includes(actor.role))teamFail('Your role cannot perform this action.',403,'ROLE_DENIED');}
export async function teamAssigned(db,actor,patientId){
 if(!teamUuid.test(patientId||''))teamFail('Patient not found.',404,'NOT_FOUND');
 if(!await db.prepare('SELECT patient_id FROM care_assignments WHERE patient_id=? AND user_id=?').bind(patientId,actor.id).first())teamFail('Patient not found in your assignments.',404,'NOT_FOUND');
}
export async function handleTeam(request,env,clock=()=>new Date().toISOString()){
 try{
  const url=new URL(request.url),now=clock(),db=env.DB;const identity=teamIdentity(request);if(!db?.prepare)teamFail('Shared storage is unavailable.',503);
  // Invitation acceptance requires a real signed-in identity but no prior membership.
  if(url.pathname==='/api/team/accept'){
   if(request.method!=='POST')teamFail('POST required.',405);const input=await teamInput(request);
   if(!/^[a-f0-9]{64}$/.test(input.token||''))teamFail('Invitation not available.',404);
   const hash=await teamDigest(input.token),invite=await db.prepare('SELECT * FROM care_invites WHERE hash=?').bind(hash).first();
   if(!invite||invite.revoked_at||invite.expires_at<=now)teamFail('This invitation expired or was revoked. Ask an admin for a new one.',410,'INVITE_UNAVAILABLE');
   if(invite.email!==identity.email)teamFail('Sign in with the email address this invitation was created for.',403,'INVITE_EMAIL_MISMATCH');
   const current=await db.prepare('SELECT * FROM care_members WHERE user_id=?').bind(identity.id).first();
   if(invite.accepted_by){if(invite.accepted_by===identity.id&&current?.status==='active')return teamJson({ok:true,member:current});teamFail('This invitation has already been used.',410);}
   if(current?.status==='active')teamFail('You are already a team member. An admin can change your role.',409);
   const other=await db.prepare('SELECT user_id FROM care_members WHERE email=? AND user_id<>?').bind(identity.email,identity.id).first();if(other)teamFail('This email is already linked to another account.',409);
   const result=await db.batch([
    db.prepare("INSERT INTO care_members (user_id,email,role,status,joined_at) SELECT ?,?,role,'active',? FROM care_invites WHERE hash=? AND accepted_by IS NULL AND revoked_at IS NULL AND expires_at>? ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,status='active',joined_at=excluded.joined_at").bind(identity.id,identity.email,now,hash,now),
    db.prepare('UPDATE care_invites SET accepted_by=?,accepted_at=? WHERE hash=? AND accepted_by IS NULL AND revoked_at IS NULL AND expires_at>?').bind(identity.id,now,hash,now),
    teamAuditStatement(db,identity,'invitation.accepted',null,{role:invite.role},now),
   ]);
   if(result[1].meta?.changes!==1)teamFail('This invitation changed. Please refresh.',409);
   return teamJson({ok:true});
  }
  const actor=await teamActor(request,env,now);
  if(url.pathname==='/api/team/me'&&request.method==='GET'){
   await teamAudit(db,actor,'session.access',null,{},now);
   return teamJson({ok:true,actor,signInUrl:'/signin-with-chatgpt?return_to=%2F%23%2Fshared',signOutUrl:'/signout-with-chatgpt?return_to=%2F%23%2Fsigned-out'});
  }
  if(url.pathname==='/api/team/signout'&&request.method==='POST'){await teamInput(request);await teamAudit(db,actor,'session.signout_requested',null,{},now);return teamJson({ok:true});}
  if(url.pathname==='/api/team/audit'&&request.method==='GET'){
   const patientId=url.searchParams.get('patientId');const [before,beforeId]=(url.searchParams.get('before')||'9999|~').split('|');if(!before||!beforeId||before.length>40||beforeId.length>50)teamFail('Invalid activity cursor.');
   if(patientId)await teamAssigned(db,actor,patientId);
   const clauses=['(created_at<? OR (created_at=? AND id<?))'],args=[before,before,beforeId];if(patientId){clauses.push('patient_id=?');args.push(patientId);}if(actor.role!=='admin'){clauses.push('actor_id=?');args.push(actor.id);}
   const rows=await db.prepare(`SELECT * FROM care_audit WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT 50`).bind(...args).all();
   return teamJson({ok:true,events:rows.results,nextBefore:rows.results.length===50?rows.results.at(-1).created_at+'|'+rows.results.at(-1).id:null});
  }
  teamRole(actor,['admin']);
  if(url.pathname==='/api/team/manage'&&request.method==='GET'){
   const members=(await db.prepare('SELECT * FROM care_members ORDER BY joined_at').all()).results;
   const invites=(await db.prepare('SELECT id,email,role,expires_at,accepted_at,revoked_at FROM care_invites ORDER BY created_at DESC LIMIT 100').all()).results;
   // Administrative directory contains names/IDs and assignments, never clinical answers.
   const patients=(await db.prepare("SELECT id,json_extract(data,'$.name') AS name FROM care_patients ORDER BY updated_at DESC LIMIT 100").all()).results;
   const assignments=(await db.prepare('SELECT patient_id,user_id FROM care_assignments').all()).results;
   await teamAudit(db,actor,'team.directory_viewed',null,{},now);
   const workspace=await db.prepare("SELECT owner_id FROM care_workspace WHERE id='main'").first();
   return teamJson({ok:true,members,invites,patients,assignments,ownerId:workspace?.owner_id});
  }
  if(request.method!=='POST')teamFail('Action not found.',404);const input=await teamInput(request);
  if(url.pathname==='/api/team/invite'){
   const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)teamFail('Enter a valid email address.');
   if(!['admin','clinician','coordinator'].includes(input.role))teamFail('Choose a valid role.');
   if(await db.prepare("SELECT user_id FROM care_members WHERE email=? AND status='active'").bind(email).first())teamFail('This email is already an active team member.',409);
   const token=teamRandom(),hash=await teamDigest(token),id=crypto.randomUUID(),expiresAt=new Date(Date.parse(now)+72*3600000).toISOString();
   await db.batch([
    db.prepare('UPDATE care_invites SET revoked_at=? WHERE email=? AND accepted_at IS NULL AND revoked_at IS NULL').bind(now,email),
    db.prepare('INSERT INTO care_invites (id,hash,email,role,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').bind(id,hash,email,input.role,actor.id,now,expiresAt),
    teamAuditStatement(db,actor,'invitation.created',null,{inviteId:id,email,role:input.role},now),
   ]);
   return teamJson({ok:true,invite:{id,email,role:input.role,expiresAt,url:`${url.origin}/#/join/${token}`}},201);
  }
  if(url.pathname==='/api/team/invite/revoke'){
   if(!teamUuid.test(input.id||''))teamFail('Invitation not found.',404);
   await db.batch([db.prepare('UPDATE care_invites SET revoked_at=? WHERE id=? AND accepted_at IS NULL').bind(now,input.id),teamAuditStatement(db,actor,'invitation.revoked',null,{inviteId:input.id},now)]);return teamJson({ok:true});
  }
  if(url.pathname==='/api/team/member'){
   const target=await db.prepare('SELECT * FROM care_members WHERE user_id=?').bind(input.userId||'').first();if(!target)teamFail('Member not found.',404);
   const owner=await db.prepare("SELECT owner_id FROM care_workspace WHERE id='main'").first();if(target.user_id===owner?.owner_id)teamFail('The workspace owner must remain an active admin.',409);
   if(!['admin','clinician','coordinator'].includes(input.role)||!['active','disabled'].includes(input.status))teamFail('Invalid role or membership status.');
   await db.batch([db.prepare('UPDATE care_members SET role=?,status=? WHERE user_id=?').bind(input.role,input.status,input.userId),teamAuditStatement(db,actor,'membership.updated',null,{userId:input.userId,role:input.role,status:input.status},now)]);return teamJson({ok:true});
  }
  if(url.pathname==='/api/team/assign'){
   if(!teamUuid.test(input.patientId||'')||!Array.isArray(input.userIds)||input.userIds.length===0||input.userIds.length>50||new Set(input.userIds).size!==input.userIds.length)teamFail('Select at least one active member.');
   if(!await db.prepare('SELECT id FROM care_patients WHERE id=?').bind(input.patientId).first())teamFail('Patient not found.',404);
   for(const id of input.userIds)if(!await db.prepare("SELECT user_id FROM care_members WHERE user_id=? AND status='active'").bind(id).first())teamFail('Only active members can be assigned.');
   await db.batch([db.prepare('DELETE FROM care_assignments WHERE patient_id=?').bind(input.patientId),...input.userIds.map(id=>db.prepare('INSERT INTO care_assignments (patient_id,user_id,assigned_at) VALUES (?,?,?)').bind(input.patientId,id,now)),teamAuditStatement(db,actor,'assignment.updated',input.patientId,{userIds:input.userIds},now)]);return teamJson({ok:true});
  }
  teamFail('Action not found.',404);
 }catch(e){return teamError(e);}
}
