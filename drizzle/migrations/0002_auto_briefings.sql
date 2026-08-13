-- Migration 0002: auto-scheduled briefing toggles
-- Adds opt-in flags to user_settings so the briefings scheduler can fire
-- a daily / weekly NotebookLM generation in the background. Both default
-- off — burning generation quota is a deliberate choice the user makes.

ALTER TABLE `user_settings` ADD COLUMN `auto_daily_briefing` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `auto_daily_briefing_last_run` integer;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `auto_weekly_briefing` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `auto_weekly_briefing_last_run` integer;
