package com.codewithmosh.store.users;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

// Beyond the course (API docs): schema descriptions and examples for Swagger UI.
@Schema(description = "Body of POST /users.")
@Data
public class RegisterUserRequest {
    @Schema(description = "Display name, at most 255 characters.", example = "John Doe")
    @NotBlank(message = "Name is required")
    @Size(max = 255, message = "Name must be less than 255 characters")
    private String name;

    @Schema(description = "E-mail address in lowercase; must not be registered yet.", example = "john@example.com")
    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    @Lowercase(message = "Email must be in lowercase")
    private String email;

    @Schema(description = "Password, 6 to 25 characters.", example = "123456")
    @NotBlank(message = "Password is required")
    @Size(min = 6, max = 25, message = "Password must be between 6 to 25 characters long.")
    private String password;
}
