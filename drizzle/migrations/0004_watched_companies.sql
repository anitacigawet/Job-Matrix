-- Migration 0004: watched companies (Phase 14 — per-company ATS sources)
-- Tracks which companies from companies-catalog.yaml a user wants Job
-- Matrix to fetch fresh job listings from on every scan. One row per
-- (user, company-slug) pair.

CREATE TABLE IF NOT EXISTS `watched_companies` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `company_slug` text NOT NULL,
  `added_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `watched_companies_user_slug_uq` ON `watched_companies` (`user_id`, `company_slug`);
