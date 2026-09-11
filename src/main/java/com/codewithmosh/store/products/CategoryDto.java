package com.codewithmosh.store.products;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Schema(description = "A product category; its `id` is the `categoryId` of GET /products and of product bodies.")
@AllArgsConstructor
@Getter
public class CategoryDto {
    // Without this, springdoc documents the Byte as a string.
    @Schema(implementation = Integer.class, description = "Category ID.", example = "1")
    private Byte id;
    @Schema(description = "Category name.", example = "Produce")
    private String name;
}
