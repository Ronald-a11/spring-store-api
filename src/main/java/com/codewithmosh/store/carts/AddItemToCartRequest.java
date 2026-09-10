package com.codewithmosh.store.carts;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AddItemToCartRequest {
    // Fix beyond the course: a missing product ID used to reach the repository and fail with a 500.
    @NotNull(message = "Product ID is required.")
    private Long productId;
}
