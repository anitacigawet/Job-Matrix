-- Migration 0001: NotebookLM briefings + resume text on user_profiles
-- Adds support for the NotebookLM Studio output track (audio overviews,
-- infographics, text reports) plus a resume-text field used by the
-- resume-critique briefing.

ALTER TABLE `user_profiles` ADD COLUMN `resume_text` text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `briefings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `briefing_type` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `title` text NOT NULL,
  `related_applied_job_id` integer,
  `related_tracked_job_id` integer,
  `notebook_id` text,
  `task_id` text,
  `context_snapshot` text,
  `text_content` text,
  `media_path` text,
  `media_type` text,
  `metadata` text,
  `error_message` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
