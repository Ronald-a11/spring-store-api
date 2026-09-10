package com.codewithmosh.store.users;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Getter;

// Beyond the course (API docs): schema descriptions and examples for Swagger UI.
@Schema(description = "A user account.")
@AllArgsConstructor
@Getter
public class UserDto {
    @Schema(description = "User ID.", example = "1")
    private Long id;
    @Schema(description = "Display name.", example = "John Doe")
    private String name;
    @Schema(description = "E-mail address, also the login name.", example = "john@example.com")
    private String email;
}
