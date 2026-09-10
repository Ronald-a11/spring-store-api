package com.codewithmosh.store.carts;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

// Beyond the course (API docs): schema descriptions and examples for Swagger UI.
@Schema(description = "A shopping cart with its items and total.")
@Data
public class CartDto {
    @Schema(description = "Cart UUID; pass it as {cartId} in the other cart endpoints and as cartId in POST /checkout.", example = "7c9e6679-7425-40de-944b-e07fc1f90ae7")
    private UUID id;
    @Schema(description = "Items in the cart.")
    private List<CartItemDto> items = new ArrayList<>();
    @Schema(description = "Sum of the items' totals.", example = "1.18")
    private BigDecimal totalPrice = BigDecimal.ZERO;
}
