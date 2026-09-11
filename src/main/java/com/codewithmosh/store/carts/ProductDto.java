package com.codewithmosh.store.carts;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

// Explicit schema name so it does not clash with products.ProductDto in the OpenAPI docs.
@Schema(name = "CartProductDto", description = "Product summary inside a cart item.")
@Data
public class ProductDto {
    @Schema(description = "Product ID.", example = "1")
    private Long id;
    @Schema(description = "Product name.", example = "Bananas")
    private String name;
    @Schema(description = "Unit price.", example = "0.59")
    private BigDecimal price;
}
