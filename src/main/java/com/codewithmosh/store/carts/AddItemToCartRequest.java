package com.codewithmosh.store.carts;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Schema(description = "Body of POST /carts/{cartId}/items.")
@Data
public class AddItemToCartRequest {
    @Schema(description = "ID of an existing product (see GET /products).", example = "1")
    @NotNull(message = "Product ID is required.")
    private Long productId;
}
