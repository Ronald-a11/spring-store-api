package com.codewithmosh.store.users;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

// Beyond the course (API docs): schema descriptions and examples for Swagger UI.
@Schema(description = "Body of POST /users/{id}/change-password.")
@Data
public class ChangePasswordRequest {
    // Fix beyond the course: validate the request so blank/short passwords are rejected with 400.
    @Schema(description = "Current password; a mismatch returns 401.", example = "123456")
    @NotBlank(message = "Old password is required.")
    private String oldPassword;

    @Schema(description = "New password, 6 to 25 characters.", example = "654321")
    @NotBlank(message = "New password is required.")
    @Size(min = 6, max = 25, message = "Password must be between 6 to 25 characters long.")
    private String newPassword;
}
