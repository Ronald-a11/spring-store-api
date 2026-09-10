package com.codewithmosh.store.payments;

import com.stripe.Stripe;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

// Fix beyond the course: logger for the startup warning below.
@Slf4j
@Configuration
public class StripeConfig {
    @Value("${stripe.secretKey}")
    private String secretKey;

    @PostConstruct
    public void init() {
        // Fix beyond the course: warn at startup instead of failing silently on the first checkout.
        if (secretKey == null || secretKey.isBlank()) {
            log.warn("STRIPE_SECRET_KEY is not set: /checkout and /checkout/webhook will fail until it is configured");
        }

        Stripe.apiKey = secretKey;
    }
}
