CREATE TABLE IF NOT EXISTS `users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `openId` text NOT NULL,
  `name` text,
  `email` text,
  `loginMethod` text,
  `role` text DEFAULT 'admin' NOT NULL,
  `onboarding_completed` integer DEFAULT 0 NOT NULL,
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
  `lastSignedIn` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_openId_unique` ON `users` (`openId`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_preferences` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `target_titles` text NOT NULL,
  `location` text NOT NULL,
  `radius_miles` integer DEFAULT 50 NOT NULL,
  `min_salary` integer,
  `max_salary` integer,
  `job_type` text,
  `remote_only` integer DEFAULT 0 NOT NULL,
  `monitoring_enabled` integer DEFAULT 1 NOT NULL,
  `scan_interval_minutes` integer DEFAULT 30 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `job_preferences_user_id_unique` ON `job_preferences` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_credentials` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `platform` text NOT NULL,
  `cookies_json` text,
  `cookie_string` text,
  `local_storage_json` text,
  `user_agent` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tracked_jobs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `platform` text NOT NULL,
  `job_id` text NOT NULL,
  `title` text NOT NULL,
  `company` text NOT NULL,
  `location` text,
  `city` text,
  `state` text,
  `salary_min` integer,
  `salary_max` integer,
  `salary_interval` text,
  `job_type` text,
  `description` text,
  `job_url` text NOT NULL,
  `date_posted` text,
  `status` text DEFAULT 'new' NOT NULL,
  `first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
  `last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
  `ai_analysis` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tracked_jobs_user_platform_jobid_idx` ON `tracked_jobs` (`user_id`, `platform`, `job_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `applied_jobs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `tracked_job_id` integer,
  `platform` text NOT NULL,
  `job_id` text NOT NULL,
  `title` text NOT NULL,
  `company` text NOT NULL,
  `location` text,
  `salary_min` integer,
  `salary_max` integer,
  `salary_interval` text,
  `job_type` text,
  `description` text,
  `job_url` text NOT NULL,
  `application_status` text DEFAULT 'applied' NOT NULL,
  `first_tracked_at` integer NOT NULL,
  `applied_at` integer DEFAULT (unixepoch()) NOT NULL,
  `interview_at` integer,
  `offer_at` integer,
  `resolved_at` integer,
  `notes` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_scan_history` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `platform` text NOT NULL,
  `scan_type` text NOT NULL,
  `search_terms` text NOT NULL,
  `location` text NOT NULL,
  `radius_miles` integer NOT NULL,
  `total_jobs_found` integer NOT NULL,
  `new_jobs_found` integer NOT NULL,
  `status` text DEFAULT 'running' NOT NULL,
  `error_message` text,
  `current_phase` text,
  `current_progress` integer,
  `total_progress` integer,
  `progress_message` text,
  `last_progress_update` integer,
  `completed_searches` text,
  `operation_paused` integer DEFAULT 0 NOT NULL,
  `operation_cancelled` integer DEFAULT 0 NOT NULL,
  `started_at` integer DEFAULT (unixepoch()) NOT NULL,
  `completed_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `debug_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer,
  `session_id` text NOT NULL,
  `level` text NOT NULL,
  `message` text NOT NULL,
  `metadata` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_job_titles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `job_title` text NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_profiles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `state` text NOT NULL,
  `city` text NOT NULL,
  `search_radius_miles` integer DEFAULT 50 NOT NULL,
  `willing_to_relocate` integer DEFAULT 0 NOT NULL,
  `remote_preference` text DEFAULT 'any' NOT NULL,
  `education_level` text DEFAULT 'no_degree' NOT NULL,
  `years_experience` text DEFAULT '0-1' NOT NULL,
  `min_salary` integer,
  `salary_filter_enabled` integer DEFAULT 0 NOT NULL,
  `skills_raw` text,
  `skills_parsed` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_profiles_user_id_unique` ON `user_profiles` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invite_codes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `code` text NOT NULL,
  `created_by` integer,
  `used_by` integer,
  `used_at` integer,
  `expires_at` integer,
  `max_uses` integer DEFAULT 1 NOT NULL,
  `current_uses` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `invite_codes_code_unique` ON `invite_codes` (`code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_settings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `notifications_enabled` integer DEFAULT 1 NOT NULL,
  `notify_on_new_eligible` integer DEFAULT 1 NOT NULL,
  `notify_on_scan_complete` integer DEFAULT 1 NOT NULL,
  `notify_digest_frequency` text DEFAULT 'daily' NOT NULL,
  `auto_scan_enabled` integer DEFAULT 0 NOT NULL,
  `auto_scan_frequency` text DEFAULT 'daily' NOT NULL,
  `auto_scan_include_ai` integer DEFAULT 1 NOT NULL,
  `auto_scan_last_run` integer,
  `auto_scan_next_run` integer,
  `enabled_platforms` text DEFAULT '["indeed"]',
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_settings_user_id_unique` ON `user_settings` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `search_presets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `name` text NOT NULL,
  `job_titles` text NOT NULL,
  `location` text NOT NULL,
  `radius_miles` integer DEFAULT 50 NOT NULL,
  `remote_preference` text DEFAULT 'any' NOT NULL,
  `platforms` text DEFAULT '["indeed"]' NOT NULL,
  `min_salary` integer,
  `job_type` text,
  `is_default` integer DEFAULT 0 NOT NULL,
  `last_used_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `application_notes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `job_id` integer NOT NULL,
  `note_type` text DEFAULT 'note' NOT NULL,
  `content` text NOT NULL,
  `old_status` text,
  `new_status` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`id`, `openId`, `name`, `email`, `role`, `onboarding_completed`)
VALUES (1, 'local-user', 'Local User', 'local@localhost', 'admin', 0);
