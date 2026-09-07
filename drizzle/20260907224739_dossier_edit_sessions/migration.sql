CREATE TABLE `dossier_presences` (
	`id` text PRIMARY KEY,
	`scope_key` text NOT NULL,
	`tab_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`station` text NOT NULL,
	`dirty` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dossier_scopes` (
	`key` text PRIMARY KEY,
	`revision` integer DEFAULT 0 NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`token` text,
	`owner_tab_id` text,
	`owner_user_id` integer,
	`owner_name` text,
	`owner_station` text,
	`expires_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dossier_presences_scope_idx` ON `dossier_presences` (`scope_key`,`expires_at`);--> statement-breakpoint
CREATE INDEX `dossier_presences_expiry_idx` ON `dossier_presences` (`expires_at`);