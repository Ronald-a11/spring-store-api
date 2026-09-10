package com.codewithmosh.store.users;

import com.codewithmosh.store.common.ErrorDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.AllArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

// Beyond the course (API docs): tag, summaries, responses and parameter descriptions for Swagger UI.
@Tag(name = "Users")
@RestController
@AllArgsConstructor
@RequestMapping("/users")
public class UserController {
    private final UserService userService;

    @Operation(summary = "List all users (admin only)",
               description = "Returns every user account. Requires the ADMIN role.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The users, sorted by the requested field.",
                     content = @Content(array = @ArraySchema(schema = @Schema(implementation = UserDto.class)))),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is not an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Access denied.\"}")))
    })
    @GetMapping
    public Iterable<UserDto> getAllUsers(
        @Parameter(description = "Sort field: `name` or `email`. Any other value (including the default, empty) sorts by name.",
                   schema = @Schema(allowableValues = {"name", "email"}))
        @RequestParam(required = false, defaultValue = "", name = "sort") String sortBy
    ) {
        return userService.getAllUsers(sortBy);
    }

    @Operation(summary = "Get a user (owner or admin)",
               description = "Returns one user. The caller must be that user or an admin; the ownership check runs first, so a foreign ID answers 403 even when it does not exist.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The user."),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is neither this user nor an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"You don't have access to this user.\"}"))),
        @ApiResponse(responseCode = "404", description = "No user with this ID (empty body).", content = @Content)
    })
    @GetMapping("/{id}")
    public UserDto getUser(@Parameter(description = "User ID.", example = "1") @PathVariable Long id) {
        return userService.getUser(id);
    }

    @Operation(summary = "Register a new user (public)",
               description = "Creates an account with the USER role (ADMIN when the e-mail is listed in the server's `ADMIN_EMAILS`) and returns it; the `Location` header points at `/users/{id}`. Log in with `POST /auth/login` afterwards.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "The created user; `Location` header set.",
                     content = @Content(schema = @Schema(implementation = UserDto.class)),
                     headers = @Header(name = "Location", description = "URL of the new user.", schema = @Schema(type = "string"))),
        @ApiResponse(responseCode = "400", description = "Validation failed or the e-mail is already registered: a field-to-message map (`{\"error\": \"Invalid request body\"}` for malformed JSON).",
                     content = @Content(schema = @Schema(type = "object"), examples = @ExampleObject(value = "{\"email\": \"Email is already registered.\"}")))
    })
    @PostMapping
    public ResponseEntity<?> registerUser(
            @Valid @RequestBody RegisterUserRequest request,
            UriComponentsBuilder uriBuilder) {

        var userDto = userService.registerUser(request);
        var uri = uriBuilder.path("/users/{id}").buildAndExpand(userDto.getId()).toUri();
        return ResponseEntity.created(uri).body(userDto);
    }

    @Operation(summary = "Update a user's name and e-mail (owner or admin)",
               description = "Replaces name and e-mail; both are required. The caller must be that user or an admin. The password is changed with `POST /users/{id}/change-password`.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The updated user."),
        @ApiResponse(responseCode = "400", description = "Validation failed or the e-mail belongs to another user: a field-to-message map.",
                     content = @Content(schema = @Schema(type = "object"), examples = @ExampleObject(value = "{\"email\": \"Email is already registered.\"}"))),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is neither this user nor an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"You don't have access to this user.\"}"))),
        @ApiResponse(responseCode = "404", description = "No user with this ID (empty body).", content = @Content)
    })
    @PutMapping("/{id}")
    public UserDto updateUser(
        @Parameter(description = "User ID.", example = "1") @PathVariable(name = "id") Long id,
        // Fix beyond the course: validate the body so a partial PUT can't blank out name/email.
        @Valid @RequestBody UpdateUserRequest request) {
        return userService.updateUser(id, request);
    }

    @Operation(summary = "Delete a user (owner or admin)",
               description = "Deletes the account unless it has orders. The caller must be that user or an admin. Access tokens already issued stay valid until they expire (15 minutes).")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Deleted (empty body)."),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body)."),
        @ApiResponse(responseCode = "403", description = "The caller is neither this user nor an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"You don't have access to this user.\"}"))),
        @ApiResponse(responseCode = "404", description = "No user with this ID (empty body)."),
        @ApiResponse(responseCode = "409", description = "The user still has orders, which reference it, so the database refuses the delete.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Request conflicts with existing data.\"}")))
    })
    @DeleteMapping("/{id}")
    public void deleteUser(@Parameter(description = "User ID.", example = "1") @PathVariable Long id) {
        userService.deleteUser(id);
    }

    @Operation(summary = "Change a user's password (owner or admin)",
               description = "Verifies the old password and stores the new one hashed. The caller must be that user or an admin.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Password changed (empty body)."),
        @ApiResponse(responseCode = "400", description = "Validation failed: a field-to-message map.",
                     content = @Content(schema = @Schema(type = "object"), examples = @ExampleObject(value = "{\"newPassword\": \"Password must be between 6 to 25 characters long.\"}"))),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token, or the old password does not match (empty body)."),
        @ApiResponse(responseCode = "403", description = "The caller is neither this user nor an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"You don't have access to this user.\"}"))),
        @ApiResponse(responseCode = "404", description = "No user with this ID (empty body).")
    })
    @PostMapping("/{id}/change-password")
    public void changePassword(
            @Parameter(description = "User ID.", example = "1") @PathVariable Long id,
            // Fix beyond the course: validate the body so blank/short passwords are rejected.
            @Valid @RequestBody ChangePasswordRequest request) {
        userService.changePassword(id, request);
    }

    @ExceptionHandler(DuplicateUserException.class)
    public ResponseEntity<Map<String, String>> handleDuplicateUser() {
        // Fix beyond the course: preset application/json so the error body is written even when Accept excludes JSON (it used to end as a 500).
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(
            Map.of("email", "Email is already registered.")
        );
    }

    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<Void> handleUserNotFound() {
        return ResponseEntity.notFound().build();
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Void> handleAccessDenied() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }

    // Fix beyond the course: touching another user's account is 403 (AccessDeniedException above stays 401 for a wrong old password).
    @ExceptionHandler(UserAccessDeniedException.class)
    public ResponseEntity<ErrorDto> handleUserAccessDenied(Exception ex) {
        // Fix beyond the course: preset application/json so the error body is written even when Accept excludes JSON (it used to end as a 500).
        return ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new ErrorDto(ex.getMessage()));
    }
}
