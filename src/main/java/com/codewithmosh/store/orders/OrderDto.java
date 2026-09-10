package com.codewithmosh.store.orders;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

// Beyond the course (API docs): schema descriptions and examples for Swagger UI.
@Schema(description = "An order created by POST /checkout.")
@Data
public class OrderDto {
    @Schema(description = "Order ID.", example = "1")
    private Long id;
    @Schema(description = "Payment status; PENDING until the Stripe webhook reports the payment.", example = "PENDING", allowableValues = {"PENDING", "PAID", "FAILED", "CANCELED"})
    private String status;
    @Schema(description = "When the order was created.", example = "2026-09-10T12:34:56")
    private LocalDateTime createdAt;
    @Schema(description = "Ordered products and quantities.")
    private List<OrderItemDto> items;
    @Schema(description = "Order total.", example = "1.18")
    private BigDecimal totalPrice;
}
