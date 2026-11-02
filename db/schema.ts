import { sqliteTable,text,integer,index } from 'drizzle-orm/sqlite-core';
export const carePatients=sqliteTable('care_patients',{
  id:text('id').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull().default(0),
  lastSubmissionId:text('last_submission_id'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const careTokens=sqliteTable('care_tokens',{
  hash:text('hash').primaryKey(),patientId:text('patient_id').references(()=>carePatients.id),kind:text('kind').notNull(),
  createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),usedAt:text('used_at'),revokedAt:text('revoked_at'),submissionId:text('submission_id'),
},t=>[index('care_tokens_patient_idx').on(t.patientId)]);
export const careOutbox=sqliteTable('care_outbox',{
  id:text('id').primaryKey(),patientId:text('patient_id').references(()=>carePatients.id),tokenHash:text('token_hash').references(()=>careTokens.hash),
  status:text('status').notNull(),providerSid:text('provider_sid'),providerCode:integer('provider_code'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
