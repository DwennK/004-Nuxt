CREATE TABLE `document_credits` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`document_id` integer NOT NULL,
	`payment_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_document_credits_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_document_credits_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `credited_total` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `kind` text DEFAULT 'receipt' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `original_payment_id` integer REFERENCES payments(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `payments` ADD `recorded_by` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `void_reason` text;--> statement-breakpoint
CREATE INDEX `document_credits_document_idx` ON `document_credits` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_credits_payment_idx` ON `document_credits` (`payment_id`);--> statement-breakpoint
CREATE INDEX `payments_original_payment_idx` ON `payments` (`original_payment_id`);
--> statement-breakpoint
CREATE VIEW payment_movements AS
SELECT id, document_id, customer_id, kind, original_payment_id, method,
       amount, paid_at, notes, recorded_by, created_at
FROM payments WHERE status = 'paid';
--> statement-breakpoint
CREATE TRIGGER payments_validate_insert BEFORE INSERT ON payments BEGIN
  SELECT RAISE(ABORT, 'PAYMENT_SIGN_INVALID') WHERE
    NOT ((NEW.kind = 'receipt' AND NEW.amount > 0 AND NEW.original_payment_id IS NULL)
      OR (NEW.kind = 'refund' AND NEW.amount < 0 AND NEW.original_payment_id IS NOT NULL AND NEW.status = 'paid'));
  SELECT RAISE(ABORT, 'REFUND_ORIGINAL_INVALID') WHERE NEW.kind = 'refund' AND NOT EXISTS (
    SELECT 1 FROM payments original WHERE original.id = NEW.original_payment_id
      AND original.kind = 'receipt' AND original.status = 'paid'
      AND original.document_id = NEW.document_id AND original.customer_id IS NEW.customer_id
      AND julianday(NEW.paid_at) >= julianday(original.paid_at)
  );
  SELECT RAISE(ABORT, 'REFUND_EXCEEDS_PAYMENT') WHERE NEW.kind = 'refund' AND
    -NEW.amount > (SELECT amount FROM payments WHERE id = NEW.original_payment_id)
      + coalesce((SELECT sum(amount) FROM payments WHERE original_payment_id = NEW.original_payment_id AND status = 'paid'), 0);
END;
--> statement-breakpoint
CREATE TRIGGER payments_protect_update BEFORE UPDATE ON payments BEGIN
  SELECT RAISE(ABORT, 'PAYMENT_IMMUTABLE') WHERE OLD.kind = 'refund'
    OR EXISTS (SELECT 1 FROM payments WHERE original_payment_id = OLD.id);
  SELECT RAISE(ABORT, 'PAYMENT_SIGN_INVALID') WHERE NEW.kind != 'receipt' OR NEW.amount <= 0 OR NEW.original_payment_id IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER payments_protect_delete BEFORE DELETE ON payments BEGIN
  SELECT RAISE(ABORT, 'PAYMENT_IMMUTABLE') WHERE OLD.kind = 'refund'
    OR EXISTS (SELECT 1 FROM payments WHERE original_payment_id = OLD.id);
END;
--> statement-breakpoint
CREATE TRIGGER document_credits_validate BEFORE INSERT ON document_credits BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_CREDIT_INVALID') WHERE NEW.amount <= 0 OR length(trim(NEW.reason)) = 0
    OR NOT EXISTS (
      SELECT 1 FROM payments refund
      JOIN documents original ON original.id = refund.document_id
      JOIN documents current ON current.id = NEW.document_id
      WHERE refund.id = NEW.payment_id AND refund.kind = 'refund' AND refund.status = 'paid' AND refund.amount = -NEW.amount
        AND (original.id = current.id OR (original.type IN ('quote', 'customer_order')
          AND original.ticket_id = current.ticket_id AND original.customer_id = current.customer_id AND original.sav_id IS current.sav_id))
    )
    OR NOT EXISTS (SELECT 1 FROM documents WHERE id = NEW.document_id AND type = 'invoice' AND status != 'cancelled' AND credited_total + NEW.amount <= total);
END;
--> statement-breakpoint
CREATE TRIGGER document_credits_total AFTER INSERT ON document_credits BEGIN
  UPDATE documents SET credited_total = credited_total + NEW.amount WHERE id = NEW.document_id;
END;
--> statement-breakpoint
CREATE TRIGGER document_credits_no_update BEFORE UPDATE ON document_credits BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_CREDIT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER document_credits_no_delete BEFORE DELETE ON document_credits BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_CREDIT_IMMUTABLE');
END;
