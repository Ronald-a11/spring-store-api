package com.codewithmosh.store.orders;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Schema(description = "Body of PUT /admin/orders/{orderId}/fulfillment.")
@Data
public class UpdateFulfillmentRequest {
    @Schema(description = "New fulfillment status. CANCELED puts the items back in stock and is final.", example = "SHIPPED")
    @NotNull(message = "Status is required.")
    private FulfillmentStatus status;
}
