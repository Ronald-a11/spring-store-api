package com.codewithmosh.store.products;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

// Beyond the course (API docs): schema descriptions and examples for Swagger UI.
@Schema(description = "A catalogue product; also the body of POST /products and PUT /products/{id}.")
@Data
public class ProductDto {
    @Schema(description = "Product ID, assigned by the server and ignored in request bodies.", example = "1", accessMode = Schema.AccessMode.READ_ONLY)
    private Long id;

    // Fix beyond the course: validate product input on POST/PUT (the controller uses @Valid).
    @Schema(description = "Product name, at most 255 characters.", example = "Bananas")
    @NotBlank(message = "Name is required.")
    @Size(max = 255, message = "Name must be less than 255 characters.")
    private String name;

    @Schema(description = "Unit price: greater than zero, at most 8 integer digits and 2 decimals.", example = "0.59")
    @NotNull(message = "Price is required.")
    @Positive(message = "Price must be greater than zero.")
    @Digits(integer = 8, fraction = 2, message = "Price must have at most 2 decimals.")
    private BigDecimal price;

    @Schema(description = "Product description.", example = "Fresh organic bananas sold per pound.")
    @NotBlank(message = "Description is required.")
    private String description;

    // implementation = Integer.class: springdoc would otherwise document the Byte as string($byte); a plain type = "integer" is ignored for properties in OpenAPI 3.1 mode.
    @Schema(implementation = Integer.class, description = "ID of an existing category; the seed data has 1 Produce, 2 Dairy, 3 Bakery, 4 Meat & Seafood, 5 Pantry Staples, 6 Beverages.", example = "1")
    @NotNull(message = "Category ID is required.")
    private Byte categoryId;
}
