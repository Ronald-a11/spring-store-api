package com.codewithmosh.store.auth;

import com.codewithmosh.store.users.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Date;

@AllArgsConstructor
@Service
public class JwtService {
    private final JwtConfig jwtConfig;

    public Jwt generateAccessToken(User user) {
        // Fix beyond the course: typed "access" (see the "type" claim in generateToken).
        return generateToken(user, jwtConfig.getAccessTokenExpiration(), "access");
    }

    public Jwt generateRefreshToken(User user) {
        // Fix beyond the course: typed "refresh" (see the "type" claim in generateToken).
        return generateToken(user, jwtConfig.getRefreshTokenExpiration(), "refresh");
    }

    // Fix beyond the course: the type parameter is written into the "type" claim.
    private Jwt generateToken(User user, long tokenExpiration, String type) {
        var claims = Jwts.claims()
                .subject(user.getId().toString())
                .add("email", user.getEmail())
                .add("name", user.getName())
                .add("role", user.getRole())
                // Fix beyond the course: mark the token type so access and refresh tokens are not interchangeable.
                .add("type", type)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000 * tokenExpiration))
                .build();

        return new Jwt(claims, jwtConfig.getSecretKey());
    }

    public Jwt parseToken(String token) {
        // Fix beyond the course: jjwt throws IllegalArgumentException for an empty token, which used to escape as a 500.
        try {
            var claims = getClaims(token);
            return new Jwt(claims, jwtConfig.getSecretKey());
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }

    private Claims getClaims(String token) {
        return Jwts.parser()
                .verifyWith(jwtConfig.getSecretKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
