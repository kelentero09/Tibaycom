CREATE TABLE `alerts` (
	`kind` text PRIMARY KEY NOT NULL,
	`last_message` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`pending_count` integer DEFAULT 1 NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_notified_at` integer
);
--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`contact` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`email_sent` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inquiries_profile_idx` ON `inquiries` (`profile_id`,`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `quotations` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `quotations_share_token_unique` ON `quotations` (`share_token`);