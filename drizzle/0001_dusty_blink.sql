CREATE TABLE `care_assignments` (
	`patient_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	PRIMARY KEY(`patient_id`, `user_id`),
	FOREIGN KEY (`patient_id`) REFERENCES `care_patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `care_members`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `care_assignments_user_idx` ON `care_assignments` (`user_id`);--> statement-breakpoint
CREATE TABLE `care_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`patient_id` text,
	`details` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `care_patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `care_audit_time_idx` ON `care_audit` (`created_at`);--> statement-breakpoint
CREATE INDEX `care_audit_patient_idx` ON `care_audit` (`patient_id`);--> statement-breakpoint
CREATE TABLE `care_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_by` text,
	`accepted_at` text,
	`revoked_at` text,
	FOREIGN KEY (`created_by`) REFERENCES `care_members`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `care_invites_hash_unique` ON `care_invites` (`hash`);--> statement-breakpoint
CREATE TABLE `care_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`joined_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `care_members_email_unique` ON `care_members` (`email`);--> statement-breakpoint
CREATE TABLE `care_otp_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text,
	`patient_id` text,
	`status` text NOT NULL,
	`provider_sid` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`verification_hash` text,
	`verified_until` text,
	FOREIGN KEY (`token_hash`) REFERENCES `care_tokens`(`hash`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `care_patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `care_otp_token_idx` ON `care_otp_challenges` (`token_hash`);--> statement-breakpoint
CREATE INDEX `care_otp_patient_idx` ON `care_otp_challenges` (`patient_id`);--> statement-breakpoint
CREATE TABLE `care_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `care_patients` ADD `created_by` text;--> statement-breakpoint
ALTER TABLE `care_patients` ADD `otp_required` integer DEFAULT 0 NOT NULL;