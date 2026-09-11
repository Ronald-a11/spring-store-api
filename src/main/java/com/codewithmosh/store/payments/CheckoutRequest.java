package com.codewithmosh.store.payments;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Schema(description = "Body of POST /checkout.")
@Data
public class CheckoutRequest {
    @Schema(description = "UUID of a non-empty cart (from POST /carts).", example = "7c9e6679-7425-40de-944b-e07fc1f90ae7")
    @NotNull(message = "Cart ID is required.")
    private UUID cartId;
}
