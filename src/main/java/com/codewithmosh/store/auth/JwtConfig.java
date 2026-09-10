package com.codewithmosh.store.auth;

import io.jsonwebtoken.security.Keys;
import io.jsonwebtoken.security.WeakKeyException;
import jakarta.annotation.PostConstruct;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import javax.crypto.SecretKey;

@Configuration
@ConfigurationProperties(prefix = "spring.jwt")
@Data
public class JwtConfig {
    private String secret;
    private int accessTokenExpiration;
    private int refreshTokenExpiration;

    public SecretKey getSecretKey() {
        return Keys.hmacShaKeyFor(secret.getBytes());
    }

    // Fix beyond the course: a blank or too-short JWT_SECRET used to boot a "healthy" app whose
    // every login failed with 401 (WeakKeyException only at the first /auth/login). Fail at
    // startup instead so a deployment health check catches it. The value is never logged.
    @PostConstruct
    void validateSecret() {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "JWT_SECRET is not set: refusing to start because every login would fail with 401. "
                            + "Generate one with: openssl rand -base64 32");
        }
        try {
            getSecretKey();
        } catch (WeakKeyException e) {
            throw new IllegalStateException(
                    "JWT_SECRET is too short (" + secret.getBytes().length * 8 + " bits; at least 256 are required): "
                            + "refusing to start because every login would fail with 401. "
                            + "Generate one with: openssl rand -base64 32", e);
        }
    }
}
