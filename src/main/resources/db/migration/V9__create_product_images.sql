CREATE TABLE product_images
(
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    content_type VARCHAR(50) NOT NULL,
    data         MEDIUMBLOB  NOT NULL
);

ALTER TABLE products
    ADD image_id BIGINT NULL,
    ADD CONSTRAINT products_image_id_unique UNIQUE (image_id),
    ADD CONSTRAINT products_product_images_id_fk FOREIGN KEY (image_id) REFERENCES product_images (id) ON DELETE SET NULL;
