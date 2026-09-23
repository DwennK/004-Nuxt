CREATE TABLE `dossier_handovers` (
	`key` text PRIMARY KEY,
	`collected` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` integer NOT NULL,
	`operation_id` text,
	`operation_expires_at` integer DEFAULT 0 NOT NULL
);
