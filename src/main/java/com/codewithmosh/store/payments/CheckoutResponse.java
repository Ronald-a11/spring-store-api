package com.codewithmosh.store.payments;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Schema(description = "Response of POST /checkout.")
@Data
public class CheckoutResponse {
    @Schema(description = "ID of the order that was created; its status stays PENDING until Stripe reports the payment.", example = "1")
    private Long orderId;
    @Schema(description = "Stripe Checkout URL; open it in a browser to pay.", example = "https://checkout.stripe.com/c/pay/cs_test_a1B2c3D4e5F6g7H8i9J0")
    private String checkoutUrl;

    public CheckoutResponse(Long orderId, String checkoutUrl) {
        this.orderId = orderId;
        this.checkoutUrl = checkoutUrl;
    }
}
