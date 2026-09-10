package com.codewithmosh.store.carts;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

// Beyond the course (API docs): schema description and example for Swagger UI.
@Schema(description = "Body of POST /carts/{cartId}/items.")
@Data
public class AddItemToCartRequest {
    // Fix beyond the course: a missing product ID used to reach the repository and fail with a 500.
    @Schema(description = "ID of an existing product (see GET /products).", example = "1")
    @NotNull(message = "Product ID is required.")
    private Long productId;
}
