CREATE TABLE `counter_customer` (
	`id` integer PRIMARY KEY,
	`customer_id` integer NOT NULL,
	CONSTRAINT `fk_counter_customer_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `sent_email_events` (
	`id` text PRIMARY KEY,
	`provider_message_id` text NOT NULL,
	`recipient` text NOT NULL,
	`sender` text NOT NULL,
	`status` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sent_emails` (
	`id` text PRIMARY KEY,
	`document_id` integer,
	`actor_id` integer,
	`idempotency_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`from_address` text NOT NULL,
	`to_addresses` text NOT NULL,
	`reply_to` text NOT NULL,
	`subject` text NOT NULL,
	`body_text` text NOT NULL,
	`attachments` text NOT NULL,
	`provider_message_id` text,
	`status` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`last_event_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_sent_emails_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_sent_emails_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `sent_email_events_message_idx` ON `sent_email_events` (`provider_message_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sent_emails_idempotency_idx` ON `sent_emails` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sent_emails_provider_idx` ON `sent_emails` (`provider_message_id`);--> statement-breakpoint
CREATE INDEX `sent_emails_created_idx` ON `sent_emails` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `sent_emails_document_idx` ON `sent_emails` (`document_id`);