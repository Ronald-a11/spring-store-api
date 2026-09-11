package com.codewithmosh.store.products;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

@Schema(description = "A catalogue product; also the body of POST /products and PUT /products/{id}.")
@Data
public class ProductDto {
    @Schema(description = "Product ID, assigned by the server and ignored in request bodies.", example = "1", accessMode = Schema.AccessMode.READ_ONLY)
    private Long id;

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

    // Without this, springdoc documents the Byte as a string.
    @Schema(implementation = Integer.class, description = "ID of an existing category; the seed data has 1 Produce, 2 Dairy, 3 Bakery, 4 Meat & Seafood, 5 Pantry Staples, 6 Beverages.", example = "1")
    @NotNull(message = "Category ID is required.")
    private Byte categoryId;

    @Schema(description = "Units in stock. Optional in POST /products (defaults to 0) and ignored by PUT /products/{id}; change it with PUT /products/{id}/stock.", example = "100")
    @PositiveOrZero(message = "Stock cannot be negative.")
    @Max(value = 1_000_000, message = "Stock cannot be more than 1000000.")
    private Integer stock;

    @Schema(description = "URL of the product photo, or null when it has none. Ignored in request bodies; upload a photo with PUT /products/{id}/image.", example = "/images/1", accessMode = Schema.AccessMode.READ_ONLY)
    private String imageUrl;
}
