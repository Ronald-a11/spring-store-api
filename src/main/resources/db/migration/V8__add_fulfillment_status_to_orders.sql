ALTER TABLE orders
    ADD fulfillment_status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING';

UPDATE orders SET fulfillment_status = 'CANCELED' WHERE status IN ('FAILED', 'CANCELED');
