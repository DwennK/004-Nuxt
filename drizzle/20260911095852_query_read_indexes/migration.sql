CREATE INDEX `catalog_items_type_order_idx` ON `catalog_items` (`type`,`category`,`name`,`id`);--> statement-breakpoint
CREATE INDEX `customers_normalized_email_idx` ON `customers` (lower(trim("email")));--> statement-breakpoint
CREATE INDEX `customers_name_order_idx` ON `customers` (`last_name`,`first_name`,`id`);--> statement-breakpoint
CREATE INDEX `documents_settlement_scope_idx` ON `documents` (`ticket_id`,`customer_id`,`type`,`status`);--> statement-breakpoint
CREATE INDEX `documents_type_issued_at_id_idx` ON `documents` (`type`,`issued_at`,`id`);--> statement-breakpoint
CREATE INDEX `payments_document_settlement_idx` ON `payments` (`document_id`,`status`,`amount`);--> statement-breakpoint
CREATE INDEX `payments_paid_period_idx` ON `payments` (`status`,`paid_at`,`method`,`amount`,`document_id`);--> statement-breakpoint
CREATE INDEX `smartphone_reservation_requests_requested_at_id_idx` ON `smartphone_reservation_requests` (`requested_at`,`id`);--> statement-breakpoint
CREATE INDEX `smartphone_reservation_requests_status_requested_at_id_idx` ON `smartphone_reservation_requests` (`status`,`requested_at`,`id`);--> statement-breakpoint
CREATE INDEX `smartphone_stocks_sold_id_idx` ON `smartphone_stocks` (`sold`,`id`);--> statement-breakpoint
CREATE INDEX `tickets_status_closed_at_idx` ON `tickets` (`status`,`closed_at`);