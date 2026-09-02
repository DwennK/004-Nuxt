-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `smartphone_stocks` (
	`id` integer AUTOINCREMENT,
	`model` text NOT NULL,
	`imei` text,
	`sku` text,
	`capacity` text NOT NULL,
	`stocked_at` text NOT NULL,
	`sold` integer DEFAULT false NOT NULL,
	CONSTRAINT `smartphone_stocks_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `smartphone_reservation_requests` (
	`id` integer AUTOINCREMENT,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`model` text NOT NULL,
	`storage` text NOT NULL,
	`requested_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	CONSTRAINT `smartphone_reservation_requests_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer AUTOINCREMENT,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`company_name` text,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`address_line_1` text,
	`address_line_2` text,
	`postal_code` text,
	`city` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `customers_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`id` integer AUTOINCREMENT,
	`name` text NOT NULL,
	`sku` text,
	`type` text NOT NULL,
	`category` text DEFAULT 'Autre' NOT NULL,
	`brand` text,
	`model` text,
	`service_kind` text,
	`keywords_json` text,
	`default_price` integer NOT NULL,
	`vat_rate` real NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `catalog_items_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` integer AUTOINCREMENT,
	`ticket_number` text NOT NULL,
	`customer_id` integer NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`brand` text,
	`model` text,
	`serial_number` text,
	`imei` text,
	`access_code` text,
	`sim_code` text,
	`issue_description` text NOT NULL,
	`internal_notes` text,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `tickets_pk` PRIMARY KEY(`id`),
	CONSTRAINT `fk_tickets_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer AUTOINCREMENT,
	`document_number` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`customer_id` integer NOT NULL,
	`ticket_id` integer,
	`issued_at` text NOT NULL,
	`subtotal` integer NOT NULL,
	`tax_amount` integer NOT NULL,
	`total` integer NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `documents_pk` PRIMARY KEY(`id`),
	CONSTRAINT `fk_documents_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_documents_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer AUTOINCREMENT,
	`customer_id` integer,
	`document_id` integer NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` integer NOT NULL,
	`paid_at` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `payments_pk` PRIMARY KEY(`id`),
	CONSTRAINT `fk_payments_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_payments_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `document_lines` (
	`id` integer AUTOINCREMENT,
	`document_id` integer NOT NULL,
	`catalog_item_id` integer,
	`label` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`vat_rate` real NOT NULL,
	`line_total` integer NOT NULL,
	`category_hint` text,
	CONSTRAINT `document_lines_pk` PRIMARY KEY(`id`),
	CONSTRAINT `fk_document_lines_catalog_item_id_catalog_items_id_fk` FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_document_lines_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` integer,
	`name` text NOT NULL,
	`address` text,
	`postal_code` text,
	`city` text,
	`country_code` text,
	`phone` text,
	`email` text,
	`website` text,
	`vat_number` text,
	`bank_name` text,
	`iban` text,
	`payment_terms` text,
	`footer_notes` text,
	`logo_data_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`customer_sms_templates_json` text,
	CONSTRAINT `company_settings_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ticket_events` (
	`id` integer AUTOINCREMENT,
	`ticket_id` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`note` text,
	`metadata_json` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `ticket_events_pk` PRIMARY KEY(`id`),
	CONSTRAINT `fk_ticket_events_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer AUTOINCREMENT,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`color` text NOT NULL,
	`vacation_days_per_year` integer DEFAULT 25 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `employees_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vacation_entries` (
	`id` integer AUTOINCREMENT,
	`employee_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`type` text DEFAULT 'full_day' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`business_days` real NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `vacation_entries_pk` PRIMARY KEY(`id`),
	CONSTRAINT `fk_vacation_entries_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `number_sequences` (
	`scope` text NOT NULL,
	`last_value` integer NOT NULL,
	CONSTRAINT `number_sequences_pk` PRIMARY KEY(`scope`)
);
--> statement-breakpoint
CREATE TABLE `ticket_lines` (
	`id` integer AUTOINCREMENT,
	`ticket_id` integer NOT NULL,
	`catalog_item_id` integer,
	`label` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`vat_rate` real NOT NULL,
	`line_total` integer NOT NULL,
	`category_hint` text,
	CONSTRAINT `ticket_lines_pk` PRIMARY KEY(`id`),
	CONSTRAINT `fk_ticket_lines_catalog_item_id_catalog_items_id_fk` FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_ticket_lines_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer AUTOINCREMENT,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`is_admin` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `users_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_imports` (
	`id` integer AUTOINCREMENT,
	`document_id` integer NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`external_number` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `document_imports_pk` PRIMARY KEY(`id`),
	CONSTRAINT `fk_document_imports_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text NOT NULL,
	`fail_count` integer DEFAULT 0 NOT NULL,
	`first_failed_at` integer DEFAULT 0 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `login_attempts_pk` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE INDEX `catalog_items_is_active_idx` ON `catalog_items` (`is_active`);--> statement-breakpoint
CREATE INDEX `catalog_items_service_kind_idx` ON `catalog_items` (`service_kind`);--> statement-breakpoint
CREATE INDEX `catalog_items_model_idx` ON `catalog_items` (`model`);--> statement-breakpoint
CREATE INDEX `catalog_items_brand_idx` ON `catalog_items` (`brand`);--> statement-breakpoint
CREATE INDEX `catalog_items_category_idx` ON `catalog_items` (`category`);--> statement-breakpoint
CREATE INDEX `catalog_items_type_idx` ON `catalog_items` (`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_items_sku_idx` ON `catalog_items` (`sku`);--> statement-breakpoint
CREATE INDEX `catalog_items_name_idx` ON `catalog_items` (`name`);--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `customers_last_name_idx` ON `customers` (`last_name`);--> statement-breakpoint
CREATE INDEX `customers_email_idx` ON `customers` (`email`);--> statement-breakpoint
CREATE INDEX `document_imports_source_external_number_idx` ON `document_imports` (`source`,`external_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_imports_source_external_id_idx` ON `document_imports` (`source`,`external_id`);--> statement-breakpoint
CREATE INDEX `document_imports_document_id_idx` ON `document_imports` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_lines_category_hint_idx` ON `document_lines` (`category_hint`);--> statement-breakpoint
CREATE INDEX `document_lines_catalog_item_id_idx` ON `document_lines` (`catalog_item_id`);--> statement-breakpoint
CREATE INDEX `document_lines_document_id_idx` ON `document_lines` (`document_id`);--> statement-breakpoint
CREATE INDEX `documents_issued_at_id_idx` ON `documents` (`issued_at`,`id`);--> statement-breakpoint
CREATE INDEX `documents_issued_at_idx` ON `documents` (`issued_at`);--> statement-breakpoint
CREATE INDEX `documents_status_idx` ON `documents` (`status`);--> statement-breakpoint
CREATE INDEX `documents_type_idx` ON `documents` (`type`);--> statement-breakpoint
CREATE INDEX `documents_ticket_id_idx` ON `documents` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `documents_customer_id_idx` ON `documents` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_document_number_idx` ON `documents` (`document_number`);--> statement-breakpoint
CREATE INDEX `employees_is_active_idx` ON `employees` (`is_active`);--> statement-breakpoint
CREATE INDEX `employees_last_name_idx` ON `employees` (`last_name`);--> statement-breakpoint
CREATE INDEX `payments_document_id_paid_at_id_idx` ON `payments` (`document_id`,`paid_at`,`id`);--> statement-breakpoint
CREATE INDEX `payments_customer_id_idx` ON `payments` (`customer_id`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
CREATE INDEX `payments_method_idx` ON `payments` (`method`);--> statement-breakpoint
CREATE INDEX `payments_paid_at_idx` ON `payments` (`paid_at`);--> statement-breakpoint
CREATE INDEX `payments_document_id_idx` ON `payments` (`document_id`);--> statement-breakpoint
CREATE INDEX `smartphone_reservation_requests_status_idx` ON `smartphone_reservation_requests` (`status`);--> statement-breakpoint
CREATE INDEX `smartphone_reservation_requests_requested_at_idx` ON `smartphone_reservation_requests` (`requested_at`);--> statement-breakpoint
CREATE INDEX `smartphone_reservation_requests_name_idx` ON `smartphone_reservation_requests` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `smartphone_stocks_sku_idx` ON `smartphone_stocks` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `smartphone_stocks_imei_idx` ON `smartphone_stocks` (`imei`);--> statement-breakpoint
CREATE INDEX `smartphone_stocks_model_idx` ON `smartphone_stocks` (`model`);--> statement-breakpoint
CREATE INDEX `ticket_events_kind_idx` ON `ticket_events` (`kind`);--> statement-breakpoint
CREATE INDEX `ticket_events_occurred_at_idx` ON `ticket_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `ticket_events_ticket_id_idx` ON `ticket_events` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `ticket_lines_category_hint_idx` ON `ticket_lines` (`category_hint`);--> statement-breakpoint
CREATE INDEX `ticket_lines_catalog_item_id_idx` ON `ticket_lines` (`catalog_item_id`);--> statement-breakpoint
CREATE INDEX `ticket_lines_ticket_id_idx` ON `ticket_lines` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `tickets_status_opened_at_id_idx` ON `tickets` (`status`,`opened_at`,`id`);--> statement-breakpoint
CREATE INDEX `tickets_opened_at_idx` ON `tickets` (`opened_at`);--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `tickets` (`status`);--> statement-breakpoint
CREATE INDEX `tickets_customer_id_idx` ON `tickets` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_ticket_number_idx` ON `tickets` (`ticket_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `vacation_entries_status_idx` ON `vacation_entries` (`status`);--> statement-breakpoint
CREATE INDEX `vacation_entries_end_date_idx` ON `vacation_entries` (`end_date`);--> statement-breakpoint
CREATE INDEX `vacation_entries_start_date_idx` ON `vacation_entries` (`start_date`);--> statement-breakpoint
CREATE INDEX `vacation_entries_employee_id_idx` ON `vacation_entries` (`employee_id`);
*/