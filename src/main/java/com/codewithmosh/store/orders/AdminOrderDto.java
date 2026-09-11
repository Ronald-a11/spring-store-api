package com.codewithmosh.store.orders;

import com.codewithmosh.store.users.UserDto;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Schema(description = "An order as an admin sees it: OrderDto plus the customer who placed it.")
@Data
public class AdminOrderDto {
    @Schema(description = "Order ID.", example = "1")
    private Long id;
    @Schema(description = "The customer who placed the order.")
    private UserDto customer;
    @Schema(description = "Payment status; PENDING until the Stripe webhook reports the payment.", example = "PAID", allowableValues = {"PENDING", "PAID", "FAILED", "CANCELED"})
    private String status;
    @Schema(description = "Where the order is on its way to the customer. CANCELED is final.", example = "PROCESSING", allowableValues = {"PROCESSING", "SHIPPED", "DELIVERED", "CANCELED"})
    private String fulfillmentStatus;
    @Schema(description = "When the order was created.", example = "2026-09-10T12:34:56")
    private LocalDateTime createdAt;
    @Schema(description = "Ordered products and quantities.")
    private List<OrderItemDto> items;
    @Schema(description = "Order total.", example = "1.18")
    private BigDecimal totalPrice;
}
