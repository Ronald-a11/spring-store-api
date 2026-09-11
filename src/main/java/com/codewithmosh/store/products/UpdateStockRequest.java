package com.codewithmosh.store.products;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

@Schema(description = "Body of PUT /products/{id}/stock.")
@Data
public class UpdateStockRequest {
    @Schema(description = "Units in stock, 0 to 1000000.", example = "25")
    @NotNull(message = "Stock is required.")
    @PositiveOrZero(message = "Stock cannot be negative.")
    @Max(value = 1_000_000, message = "Stock cannot be more than 1000000.")
    private Integer stock;
}
