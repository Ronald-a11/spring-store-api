package com.codewithmosh.store.payments;

import com.codewithmosh.store.common.ErrorDto;
import com.codewithmosh.store.carts.CartEmptyException;
import com.codewithmosh.store.carts.CartNotFoundException;
import com.codewithmosh.store.orders.OrderRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

// Fix beyond the course: logger for the payment error log in handlePaymentException.
@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/checkout")
public class CheckoutController {
    private final CheckoutService checkoutService;
    private final OrderRepository orderRepository;

    @PostMapping
    public CheckoutResponse checkout(@Valid @RequestBody CheckoutRequest request) {
        return checkoutService.checkout(request);
    }

    // Fix beyond the course: returns a ResponseEntity so the missing-header case below can answer 400.
    @PostMapping("/webhook")
    public ResponseEntity<?> handleWebhook(
        @RequestHeader Map<String, String> headers,
        @RequestBody String payload
    ) {
        // Fix beyond the course: reject a missing signature header up front instead of letting stripe-java NPE.
        var signature = headers.get("stripe-signature");
        if (signature == null || signature.isBlank()) {
            return ResponseEntity.badRequest().body(new ErrorDto("Missing stripe-signature header."));
        }

        checkoutService.handleWebhookEvent(new WebhookRequest(headers, payload));

        return ResponseEntity.ok().build();
    }

    @ExceptionHandler(PaymentException.class)
    public ResponseEntity<?> handlePaymentException(PaymentException ex) {
        // Fix beyond the course: log the reason server side; the response body stays generic.
        log.error("Payment error: {}", ex.getMessage());

        // Fix beyond the course: preset application/json so the error body is written even when Accept excludes JSON.
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new ErrorDto("Error creating a checkout session"));
    }


    @ExceptionHandler({CartNotFoundException.class, CartEmptyException.class})
    public ResponseEntity<ErrorDto> handleException(Exception ex) {
        // Fix beyond the course: preset application/json so the error body is written even when Accept excludes JSON (it used to end as a 500).
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(new ErrorDto(ex.getMessage()));
    }
}
