DROP INDEX IF EXISTS `catalog_items_sku_idx`;--> statement-breakpoint
CREATE INDEX `catalog_items_sku_lookup_idx` ON `catalog_items` (`sku`);