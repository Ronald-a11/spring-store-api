package com.codewithmosh.store.carts;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

// Beyond the course (API docs): schema description and example for Swagger UI.
@Schema(description = "Body of PUT /carts/{cartId}/items/{productId}.")
@Data
public class UpdateCartItemRequest {
    @Schema(description = "New quantity of the product in the cart, 1 to 1000.", example = "2")
    @NotNull(message = "Quantity must be provided.")
    @Min(value = 1, message = "Quantity must be greater than zero.")
    // Fix beyond the course: the message said 100 while the limit is 1000.
    @Max(value = 1000, message = "Quantity must be less than or equal to 1000.")
    private Integer quantity;
}
