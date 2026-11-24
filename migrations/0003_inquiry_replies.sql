CREATE TABLE `inquiry_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inquiry_messages_inquiry_idx` ON `inquiry_messages` (`inquiry_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `inquiries` ADD `thread_token` text;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `sender_user_id` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `last_message_at` integer;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `client_read_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `inquiries_thread_token_unique` ON `inquiries` (`thread_token`);--> statement-breakpoint
CREATE INDEX `inquiries_sender_idx` ON `inquiries` (`sender_user_id`);--> statement-breakpoint
UPDATE `inquiries` SET `last_message_at` = `created_at` WHERE `last_message_at` IS NULL;