CREATE TABLE `care_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text,
	`token_hash` text,
	`status` text NOT NULL,
	`provider_sid` text,
	`provider_code` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `care_patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`token_hash`) REFERENCES `care_tokens`(`hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `care_patients` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`last_submission_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `care_tokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`patient_id` text,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`revoked_at` text,
	`submission_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `care_patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `care_tokens_patient_idx` ON `care_tokens` (`patient_id`);