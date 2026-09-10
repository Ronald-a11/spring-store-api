package com.codewithmosh.store.orders;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

// Beyond the course (API docs): schema descriptions and examples for Swagger UI.
@Schema(description = "A product line in an order.")
@Data
public class OrderItemDto {
    @Schema(description = "The ordered product.")
    private ProductDto product;
    @Schema(description = "Quantity ordered.", example = "2")
    private int quantity;
    @Schema(description = "Unit price multiplied by the quantity.", example = "1.18")
    private BigDecimal totalPrice;
}
