package com.codewithmosh.store.carts;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Schema(description = "Body of PUT /carts/{cartId}/items/{productId}.")
@Data
public class UpdateCartItemRequest {
    @Schema(description = "New quantity of the product in the cart, 1 to 1000.", example = "2")
    @NotNull(message = "Quantity must be provided.")
    @Min(value = 1, message = "Quantity must be greater than zero.")
    @Max(value = 1000, message = "Quantity must be less than or equal to 1000.")
    private Integer quantity;
}
