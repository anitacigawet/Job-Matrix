-- Migration 0003: per-platform scraper health tracking
-- Stores the latest success / failure / error per scraper platform so the
-- UI can surface honest "Working / Blocked / Not tested" status without
-- users having to read JobSpy library logs.

CREATE TABLE IF NOT EXISTS `scraper_health` (
  `platform` text PRIMARY KEY NOT NULL,
  `last_success_at` integer,
  `last_attempt_at` integer,
  `last_error` text,
  `total_attempts` integer DEFAULT 0 NOT NULL,
  `total_failures` integer DEFAULT 0 NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
