import { sqliteTable,text,integer,index,primaryKey } from 'drizzle-orm/sqlite-core';
export const carePatients=sqliteTable('care_patients',{
  id:text('id').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull().default(0),
  lastSubmissionId:text('last_submission_id'),createdBy:text('created_by'),otpRequired:integer('otp_required').notNull().default(0),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const careTokens=sqliteTable('care_tokens',{
  hash:text('hash').primaryKey(),patientId:text('patient_id').references(()=>carePatients.id),kind:text('kind').notNull(),
  createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),usedAt:text('used_at'),revokedAt:text('revoked_at'),submissionId:text('submission_id'),
},t=>[index('care_tokens_patient_idx').on(t.patientId)]);
export const careOutbox=sqliteTable('care_outbox',{
  id:text('id').primaryKey(),patientId:text('patient_id').references(()=>carePatients.id),tokenHash:text('token_hash').references(()=>careTokens.hash),
  status:text('status').notNull(),providerSid:text('provider_sid'),providerCode:integer('provider_code'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const careMembers=sqliteTable('care_members',{
 userId:text('user_id').primaryKey(),email:text('email').notNull().unique(),role:text('role').notNull(),status:text('status').notNull(),joinedAt:text('joined_at').notNull(),
});
export const careWorkspace=sqliteTable('care_workspace',{id:text('id').primaryKey(),ownerId:text('owner_id').notNull()});
export const careAssignments=sqliteTable('care_assignments',{
 patientId:text('patient_id').notNull().references(()=>carePatients.id),userId:text('user_id').notNull().references(()=>careMembers.userId),assignedAt:text('assigned_at').notNull(),
},t=>[primaryKey({columns:[t.patientId,t.userId]}),index('care_assignments_user_idx').on(t.userId)]);
export const careInvites=sqliteTable('care_invites',{
 id:text('id').primaryKey(),hash:text('hash').notNull().unique(),email:text('email').notNull(),role:text('role').notNull(),createdBy:text('created_by').references(()=>careMembers.userId),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),acceptedBy:text('accepted_by'),acceptedAt:text('accepted_at'),revokedAt:text('revoked_at'),
});
export const careAudit=sqliteTable('care_audit',{
 id:text('id').primaryKey(),actorId:text('actor_id').notNull(),actorEmail:text('actor_email').notNull(),action:text('action').notNull(),patientId:text('patient_id').references(()=>carePatients.id),details:text('details').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('care_audit_time_idx').on(t.createdAt),index('care_audit_patient_idx').on(t.patientId)]);
export const careOtpChallenges=sqliteTable('care_otp_challenges',{
 id:text('id').primaryKey(),tokenHash:text('token_hash').references(()=>careTokens.hash),patientId:text('patient_id').references(()=>carePatients.id),status:text('status').notNull(),providerSid:text('provider_sid'),attempts:integer('attempts').notNull().default(0),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),verificationHash:text('verification_hash'),verifiedUntil:text('verified_until'),
},t=>[index('care_otp_token_idx').on(t.tokenHash),index('care_otp_patient_idx').on(t.patientId)]);
