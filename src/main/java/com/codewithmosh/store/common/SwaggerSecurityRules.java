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
            .requestMatchers(HttpMethod.GET, "/").permitAll()
            .requestMatchers(HttpMethod.HEAD, "/").permitAll()
            .requestMatchers(HttpMethod.GET, "/checkout-success", "/checkout-cancel").permitAll()
            .requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
            .requestMatchers(HttpMethod.HEAD, "/actuator/health").permitAll()
            .requestMatchers(HttpMethod.GET, "/app.js", "/app.css", "/favicon.ico").permitAll()
            .requestMatchers("/swagger-ui/**").permitAll()
            .requestMatchers("/swagger-ui.html").permitAll()
            .requestMatchers("/v3/api-docs/**").permitAll();
    }
}
