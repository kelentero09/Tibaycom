CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_type` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`metadata` text,
	`ip` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`interval` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` integer NOT NULL,
	`fee` integer DEFAULT 0 NOT NULL,
	`net_amount` integer DEFAULT 0 NOT NULL,
	`refunded_amount` integer DEFAULT 0 NOT NULL,
	`checkout_session_id` text,
	`provider_payment_id` text,
	`payment_method` text,
	`livemode` integer DEFAULT false NOT NULL,
	`period_start` integer,
	`period_end` integer,
	`paid_at` integer,
	`failure_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_checkout_session_id_unique` ON `payments` (`checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_payment_id_unique` ON `payments` (`provider_payment_id`);--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_status_paid_idx` ON `payments` (`status`,`paid_at`);--> statement-breakpoint
CREATE TABLE `profile_professions` (
	`profile_id` text NOT NULL,
	`profession` text NOT NULL,
	PRIMARY KEY(`profile_id`, `profession`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_professions_profession_idx` ON `profile_professions` (`profession`);--> statement-breakpoint
CREATE TABLE `profile_specializations` (
	`profile_id` text NOT NULL,
	`specialization` text NOT NULL,
	PRIMARY KEY(`profile_id`, `specialization`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_specializations_spec_idx` ON `profile_specializations` (`specialization`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`business_name` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`services` text DEFAULT '[]' NOT NULL,
	`years_experience` integer,
	`province` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`service_areas` text DEFAULT '[]' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`facebook_url` text DEFAULT '' NOT NULL,
	`messenger_url` text DEFAULT '' NOT NULL,
	`avatar_key` text,
	`logo_key` text,
	`cover_key` text,
	`is_published` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_user_id_unique` ON `profiles` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_username_unique` ON `profiles` (`username`);--> statement-breakpoint
CREATE INDEX `profiles_location_idx` ON `profiles` (`province`,`city`);--> statement-breakpoint
CREATE INDEX `profiles_listing_idx` ON `profiles` (`status`,`is_published`,`updated_at`);--> statement-breakpoint
CREATE TABLE `project_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_photos_key_unique` ON `project_photos` (`key`);--> statement-breakpoint
CREATE INDEX `project_photos_project_idx` ON `project_photos` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `project_photos_profile_idx` ON `project_photos` (`profile_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`year` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_profile_idx` ON `projects` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `quotations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`number` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`client_name` text NOT NULL,
	`client_address` text DEFAULT '' NOT NULL,
	`client_contact` text DEFAULT '' NOT NULL,
	`issue_date` text NOT NULL,
	`valid_until` text NOT NULL,
	`items` text NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` integer DEFAULT 0 NOT NULL,
	`tax_rate_bps` integer DEFAULT 0 NOT NULL,
	`payment_terms` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`subtotal` integer NOT NULL,
	`discount_amount` integer NOT NULL,
	`tax_amount` integer NOT NULL,
	`total` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quotations_user_idx` ON `quotations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`reporter_email` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`interval` text NOT NULL,
	`status` text NOT NULL,
	`price_amount` integer NOT NULL,
	`current_period_start` integer NOT NULL,
	`current_period_end` integer NOT NULL,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`reminder_sent_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_user_id_unique` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_end_idx` ON `subscriptions` (`status`,`current_period_end`);--> statement-breakpoint
CREATE TABLE `two_factor` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`user_id` text NOT NULL,
	`verified` integer DEFAULT true,
	`failed_verification_count` integer DEFAULT 0,
	`locked_until` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `two_factor_user_idx` ON `two_factor` (`user_id`);--> statement-breakpoint
CREATE INDEX `two_factor_secret_idx` ON `two_factor` (`secret`);--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`user_id` text NOT NULL,
	`period` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `period`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`role` text DEFAULT 'user',
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer,
	`two_factor_enabled` integer DEFAULT false
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `user_created_idx` ON `user` (`created_at`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`received_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
