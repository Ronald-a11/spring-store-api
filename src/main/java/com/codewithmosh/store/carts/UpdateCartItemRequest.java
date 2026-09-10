package com.codewithmosh.store.carts;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UpdateCartItemRequest {
    @NotNull(message = "Quantity must be provided.")
    @Min(value = 1, message = "Quantity must be greater than zero.")
    // Fix beyond the course: the message said 100 while the limit is 1000.
    @Max(value = 1000, message = "Quantity must be less than or equal to 1000.")
    private Integer quantity;
}
