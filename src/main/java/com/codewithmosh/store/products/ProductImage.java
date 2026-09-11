package com.codewithmosh.store.products;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "product_images")
public class ProductImage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "content_type")
    private String contentType;

    @Column(name = "data")
    private byte[] data;

    public ProductImage(String contentType, byte[] data) {
        this.contentType = contentType;
        this.data = data;
    }
}
