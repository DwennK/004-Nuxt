CREATE TABLE `tac_blocks` (
	`id` text PRIMARY KEY,
	`version` text NOT NULL,
	`prefix` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tac_sync_state` (
	`id` integer PRIMARY KEY,
	`active_version` text,
	`previous_version` text,
	`source_commit` text,
	`checked_at` integer,
	`updated_at` integer,
	`entry_count` integer DEFAULT 0 NOT NULL,
	`ignored_count` integer DEFAULT 0 NOT NULL,
	`conflict_count` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tac_blocks_version_prefix_idx` ON `tac_blocks` (`version`,`prefix`);