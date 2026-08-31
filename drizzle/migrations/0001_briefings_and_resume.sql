-- Adds the resume text used for job-fit scoring and application preparation.

ALTER TABLE `user_profiles` ADD COLUMN `resume_text` text;
