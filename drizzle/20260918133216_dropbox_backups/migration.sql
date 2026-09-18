CREATE TABLE `backup_runs` (
	`id` text PRIMARY KEY,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`bytes` integer,
	`path` text,
	`content_hash` text,
	`error_code` text,
	`schedule_key` text
);
--> statement-breakpoint
CREATE TABLE `backup_settings` (
	`id` integer PRIMARY KEY,
	`refresh_token_encrypted` text,
	`account_email` text,
	`daily_enabled` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backup_runs_started_idx` ON `backup_runs` (`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `backup_runs_running_idx` ON `backup_runs` (`status`) WHERE "backup_runs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX `backup_runs_schedule_idx` ON `backup_runs` (`schedule_key`);