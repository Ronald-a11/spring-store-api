package com.codewithmosh.store.products;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Getter;

// Fix beyond the course: response item of GET /categories (the course has no category endpoint).
// Beyond the course (API docs): schema descriptions and examples for Swagger UI.
@Schema(description = "A product category; its `id` is the `categoryId` of GET /products and of product bodies.")
@AllArgsConstructor
@Getter
public class CategoryDto {
    // implementation = Integer.class: springdoc would otherwise document the Byte as string($byte) (see ProductDto.categoryId).
    @Schema(implementation = Integer.class, description = "Category ID.", example = "1")
    private Byte id;
    @Schema(description = "Category name.", example = "Produce")
    private String name;
}
