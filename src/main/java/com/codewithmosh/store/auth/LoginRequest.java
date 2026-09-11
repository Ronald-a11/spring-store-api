package com.codewithmosh.store.auth;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Schema(description = "Body of POST /auth/login.")
@Data
public class LoginRequest {
    @Schema(description = "Registered e-mail address.", example = "john@example.com")
    @NotBlank(message = "Email is required")
    @Email
    private String email;

    @Schema(description = "Account password.", example = "123456")
    @NotBlank(message = "Password is required")
    private String password;
}
