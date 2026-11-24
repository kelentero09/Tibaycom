CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`owner_reply` text,
	`owner_reply_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_profile_author_idx` ON `reviews` (`profile_id`,`author_user_id`);--> statement-breakpoint
CREATE INDEX `reviews_profile_idx` ON `reviews` (`profile_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_author_idx` ON `reviews` (`author_user_id`);--> statement-breakpoint
ALTER TABLE `reports` ADD `review_id` text REFERENCES reviews(id) ON DELETE CASCADE;