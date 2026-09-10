package com.codewithmosh.store.common;

import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
import org.springframework.stereotype.Component;

@Component
public class SwaggerSecurityRules implements SecurityRules {
    @Override
    public void configure(AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry registry) {
        registry
            // Fix beyond the course: the home page is public (the course left "/" behind anyRequest().authenticated(), so the root URL answered 401).
            .requestMatchers(HttpMethod.GET, "/").permitAll()
            // Fix beyond the course: HEAD "/" is public too - it was the health-check path (railway.json) before /actuator/health, and probes that send HEAD got 401.
            .requestMatchers(HttpMethod.HEAD, "/").permitAll()
            // Fix beyond the course: Stripe's return pages (HomeController) are public, GET only.
            .requestMatchers(HttpMethod.GET, "/checkout-success", "/checkout-cancel").permitAll()
            // Fix beyond the course: the health check (railway.json) is public, GET only; /actuator itself and every other actuator path stay behind authentication (401).
            .requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
            // Fix beyond the course: the storefront's assets (src/main/resources/static/) are public, GET only and nothing broader.
            .requestMatchers(HttpMethod.GET, "/app.js", "/app.css", "/favicon.ico").permitAll()
            .requestMatchers("/swagger-ui/**").permitAll()
            .requestMatchers("/swagger-ui.html").permitAll()
            .requestMatchers("/v3/api-docs/**").permitAll();
    }
}
