package com.codewithmosh.store.carts;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

// Beyond the course (API docs): schema descriptions and examples for Swagger UI.
@Schema(description = "A product line in a cart.")
@Data
public class CartItemDto {
    @Schema(description = "The product in the cart.")
    private ProductDto product;
    @Schema(description = "Quantity in the cart, 1 to 1000.", example = "2")
    private int quantity;
    @Schema(description = "Unit price multiplied by the quantity.", example = "1.18")
    private BigDecimal totalPrice;
}
