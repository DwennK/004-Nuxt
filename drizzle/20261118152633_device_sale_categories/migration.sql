UPDATE document_lines SET category_hint = 'device_refurbished'
WHERE category_hint IN ('device', 'ecommerce');
--> statement-breakpoint
UPDATE ticket_lines SET category_hint = 'device_refurbished'
WHERE category_hint IN ('device', 'ecommerce');
--> statement-breakpoint
-- Manual allocations store absolute cents. Merge shares that now have the
-- same category, retaining their original position and the payment sign.
UPDATE payment_classifications
SET allocations = (
  SELECT json_group_array(json_object('category', category, 'amount', amount))
  FROM (
    SELECT CASE WHEN value ->> '$.category' IN ('device', 'ecommerce')
                THEN 'device_refurbished' ELSE value ->> '$.category' END AS category,
           sum(value ->> '$.amount') AS amount
    FROM json_each(payment_classifications.allocations)
    GROUP BY category ORDER BY min(key)
  )
), revision = revision + 1
WHERE EXISTS (
  SELECT 1 FROM json_each(payment_classifications.allocations)
  WHERE value ->> '$.category' IN ('device', 'ecommerce')
);
