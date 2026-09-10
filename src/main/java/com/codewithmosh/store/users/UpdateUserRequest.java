package com.codewithmosh.store.users;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

// Beyond the course (API docs): schema descriptions and examples for Swagger UI.
@Schema(description = "Body of PUT /users/{id}. Both fields are required; the password is not changed here.")
@Data
public class UpdateUserRequest {
    // Fix beyond the course: validate like RegisterUserRequest so a partial PUT can't blank out name/email.
    @Schema(description = "New display name, at most 255 characters.", example = "John Doe")
    @NotBlank(message = "Name is required")
    @Size(max = 255, message = "Name must be less than 255 characters")
    public String name;

    @Schema(description = "New e-mail address in lowercase; must not belong to another user.", example = "john@example.com")
    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    @Lowercase(message = "Email must be in lowercase")
    public String email;
}
