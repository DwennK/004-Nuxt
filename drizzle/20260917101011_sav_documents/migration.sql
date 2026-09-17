ALTER TABLE `documents` ADD `sav_id` integer REFERENCES documents(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `documents` ADD `sav_details` text;--> statement-breakpoint
CREATE INDEX `documents_sav_id_idx` ON `documents` (`sav_id`);