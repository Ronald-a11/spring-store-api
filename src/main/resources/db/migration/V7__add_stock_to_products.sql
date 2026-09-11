ALTER TABLE products
    ADD stock INT NOT NULL DEFAULT 0,
    ADD CONSTRAINT products_stock_not_negative CHECK (stock >= 0);

-- Products that already exist start with 100 in stock so the shop keeps selling after the upgrade.
UPDATE products SET stock = 100;
