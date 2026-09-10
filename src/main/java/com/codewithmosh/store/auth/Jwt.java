package com.codewithmosh.store.auth;

import com.codewithmosh.store.users.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;

import javax.crypto.SecretKey;
import java.util.Date;

public class Jwt {
    private final Claims claims;
    private final SecretKey secretKey;

    public Jwt(Claims claims, SecretKey secretKey) {
        this.claims = claims;
        this.secretKey = secretKey;
    }

    public boolean isExpired() {
        return claims.getExpiration().before(new Date());
    }

    public Long getUserId() {
        return Long.valueOf(claims.getSubject());
    }

    public Role getRole() {
        return Role.valueOf(claims.get("role", String.class));
    }

    // Fix beyond the course: a refresh token must not be usable as an access token (and vice versa).
    public boolean isRefreshToken() {
        return "refresh".equals(claims.get("type", String.class));
    }

    // Fix beyond the course: only a token explicitly typed "access" authenticates a request (untyped tokens from older builds are rejected).
    public boolean isAccessToken() {
        return "access".equals(claims.get("type", String.class));
    }

    public String toString() {
        return Jwts.builder().claims(claims).signWith(secretKey).compact();
    }
}
