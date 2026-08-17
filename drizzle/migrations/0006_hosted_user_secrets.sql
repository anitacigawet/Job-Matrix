CREATE TABLE IF NOT EXISTS `user_secret_settings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL UNIQUE,
  `ciphertext` text NOT NULL,
  `iv` text NOT NULL,
  `auth_tag` text NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
