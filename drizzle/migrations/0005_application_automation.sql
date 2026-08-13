CREATE TABLE `application_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`full_name` text,
	`email` text,
	`phone` text,
	`address_line_1` text,
	`address_line_2` text,
	`city` text,
	`state` text,
	`postal_code` text,
	`availability` text,
	`earliest_start_date` text,
	`work_authorized` integer,
	`sponsorship_required` integer,
	`transportation` text,
	`desired_pay` text,
	`resume_file_name` text,
	`resume_file_path` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_profiles_user_id_unique` ON `application_profiles` (`user_id`);
--> statement-breakpoint
CREATE TABLE `inbox_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`applied_job_id` integer,
	`provider` text DEFAULT 'gmail' NOT NULL,
	`provider_message_id` text NOT NULL,
	`provider_thread_id` text,
	`source` text DEFAULT 'email' NOT NULL,
	`sender` text,
	`sender_address` text,
	`sender_phone` text,
	`subject` text NOT NULL,
	`snippet` text,
	`category` text NOT NULL,
	`summary` text NOT NULL,
	`match_confidence` integer DEFAULT 0 NOT NULL,
	`classification_confidence` integer DEFAULT 0 NOT NULL,
	`needs_review` integer DEFAULT true NOT NULL,
	`received_at` integer NOT NULL,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`applied_job_id`) REFERENCES `applied_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_messages_provider_message_id_unique` ON `inbox_messages` (`provider_message_id`);
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `notify_on_employer_response` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `inbox_monitoring_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `gmail_history_id` text;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `inbox_last_checked_at` integer;
