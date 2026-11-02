CREATE TABLE `payment_classifications` (
	`payment_id` integer PRIMARY KEY,
	`allocations` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` integer NOT NULL,
	CONSTRAINT `fk_payment_classifications_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE CASCADE
);
