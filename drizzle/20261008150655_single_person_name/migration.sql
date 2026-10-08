-- Preserve the full text before dropping the two legacy columns.
-- Suspected duplicate prefixes are deliberately retained for manual review.
-- Apply only with writes paused and a verified backup; old application builds
-- cannot read/write this schema. No table rebuild or identity change is needed.
ALTER TABLE `customers` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `customers` SET `name` = trim(trim(coalesce(`first_name`, '')) || ' ' || trim(coalesce(`last_name`, '')));--> statement-breakpoint
UPDATE `employees` SET `name` = trim(trim(coalesce(`first_name`, '')) || ' ' || trim(coalesce(`last_name`, '')));--> statement-breakpoint
DROP INDEX IF EXISTS `customers_name_order_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `customers_last_name_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `employees_last_name_idx`;--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `first_name`;--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `last_name`;--> statement-breakpoint
ALTER TABLE `employees` DROP COLUMN `first_name`;--> statement-breakpoint
ALTER TABLE `employees` DROP COLUMN `last_name`;--> statement-breakpoint
CREATE INDEX `customers_name_order_idx` ON `customers` (`name`, `id`);--> statement-breakpoint
CREATE INDEX `employees_name_idx` ON `employees` (`name`);
