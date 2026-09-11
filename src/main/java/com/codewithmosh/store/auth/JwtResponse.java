package com.codewithmosh.store.auth;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;

@Schema(description = "Response of POST /auth/login and POST /auth/refresh.")
@Data
@AllArgsConstructor
public class JwtResponse {
    @Schema(description = "JWT access token, valid for 15 minutes. Send it as `Authorization: Bearer <token>`.",
            example = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyJ9.5Z8m3xQfT0aM1jzv6b4lB2cDkNwXo7RsYh9pEuVgLiA")
    private String token;
}
