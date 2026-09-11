package com.codewithmosh.store.payments;

import com.codewithmosh.store.common.ErrorDto;
import com.codewithmosh.store.carts.CartEmptyException;
import com.codewithmosh.store.carts.CartNotFoundException;
import com.codewithmosh.store.orders.OrderRepository;
import com.codewithmosh.store.products.OutOfStockException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Tag(name = "Checkout")
@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/checkout")
public class CheckoutController {
    private final CheckoutService checkoutService;
    private final OrderRepository orderRepository;

    @Operation(summary = "Check out a cart",
               description = "Creates an order (status PENDING, fulfillment PROCESSING) for the authenticated user from the cart's items, takes the items out of stock, opens a Stripe Checkout Session and returns its URL; the cart is cleared on success. If a product doesn't have enough stock left, or Stripe rejects the request, nothing is saved and the cart is kept. A failed payment or an admin canceling the order puts the items back in stock. Needs `STRIPE_SECRET_KEY`: until it is configured every call returns 500 with `{\"error\": \"Error creating a checkout session\"}`.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The order ID and the Stripe Checkout URL to open in a browser."),
        @ApiResponse(responseCode = "400", description = "The cart does not exist or is empty, a product doesn't have enough stock, or validation failed (a field-to-message map).",
                     content = @Content(schema = @Schema(type = "object"), examples = {
                         @ExampleObject(name = "Unknown cart", value = "{\"error\": \"Cart not found\"}"),
                         @ExampleObject(name = "Empty cart", value = "{\"error\": \"Cart is empty\"}"),
                         @ExampleObject(name = "Not enough stock", value = "{\"error\": \"Only 2 left in stock for Bananas.\"}"),
                         @ExampleObject(name = "Missing cartId", value = "{\"cartId\": \"Cart ID is required.\"}")})),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "500", description = "Stripe could not create the checkout session, typically because `STRIPE_SECRET_KEY` is not configured; the reason is logged server-side.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Error creating a checkout session\"}")))
    })
    @PostMapping
    public CheckoutResponse checkout(@Valid @RequestBody CheckoutRequest request) {
        return checkoutService.checkout(request);
    }

    @Operation(summary = "Stripe webhook (public, called by Stripe)",
               description = "Receives Stripe events signed with `STRIPE_WEBHOOK_SECRET_KEY`. `payment_intent.succeeded` marks the order named in the payment intent's `order_id` metadata PAID and `payment_intent.payment_failed` marks it FAILED and cancels it, which puts its items back in stock; other event types, unknown orders and orders that are no longer PENDING are ignored. Not meant to be called by hand: the `Stripe-Signature` header must match the raw payload, so use the Stripe CLI (`stripe listen --forward-to .../checkout/webhook`) to exercise it.",
               parameters = @Parameter(name = "Stripe-Signature", in = ParameterIn.HEADER, required = true, schema = @Schema(type = "string"),
                                       description = "Stripe's signature of the payload, computed with the endpoint's signing secret."))
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Event accepted, including ignored ones (empty body).", content = @Content),
        @ApiResponse(responseCode = "400", description = "`Stripe-Signature` header missing.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Missing stripe-signature header.\"}"))),
        @ApiResponse(responseCode = "500", description = "Signature verification failed or the event could not be parsed.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Error creating a checkout session\"}")))
    })
    @PostMapping("/webhook")
    public ResponseEntity<?> handleWebhook(
        @Parameter(hidden = true) @RequestHeader Map<String, String> headers,
        @io.swagger.v3.oas.annotations.parameters.RequestBody(description = "The raw Stripe event JSON exactly as Stripe sends it; the signature is computed over these bytes.")
        @RequestBody String payload
    ) {
        var signature = headers.get("stripe-signature");
        if (signature == null || signature.isBlank()) {
            return ResponseEntity.badRequest().body(new ErrorDto("Missing stripe-signature header."));
        }

        checkoutService.handleWebhookEvent(new WebhookRequest(headers, payload));

        return ResponseEntity.ok().build();
    }

    @ExceptionHandler(PaymentException.class)
    public ResponseEntity<?> handlePaymentException(PaymentException ex) {
        log.error("Payment error: {}", ex.getMessage());

        // Set the content type explicitly so the body is written even when Accept excludes JSON.
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new ErrorDto("Error creating a checkout session"));
    }

    @ExceptionHandler({CartNotFoundException.class, CartEmptyException.class, OutOfStockException.class})
    public ResponseEntity<ErrorDto> handleException(Exception ex) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(new ErrorDto(ex.getMessage()));
    }
}
