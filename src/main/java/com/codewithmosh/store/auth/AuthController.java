package com.codewithmosh.store.auth;

import com.codewithmosh.store.users.UserDto;
import com.codewithmosh.store.users.UserMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.AllArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.*;

// Beyond the course (API docs): tag, summaries, responses and parameter descriptions for Swagger UI.
@Tag(name = "Auth")
@AllArgsConstructor
@RestController
@RequestMapping("/auth")
public class AuthController {
    private final JwtConfig jwtConfig;
    private final UserMapper userMapper;
    private final AuthService authService;

    @Operation(summary = "Log in (public)",
               description = "Checks e-mail and password and returns a JWT access token valid for 15 minutes. A refresh token valid for 7 days is set as an HttpOnly, Secure `refreshToken` cookie scoped to `/auth/refresh`. Paste the access token into **Authorize** to call the protected endpoints.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The access token; the refresh token travels in a `Set-Cookie` header.",
                     headers = @Header(name = "Set-Cookie", description = "`refreshToken` cookie: HttpOnly, Secure, Path=/auth/refresh, Max-Age 7 days.", schema = @Schema(type = "string"))),
        @ApiResponse(responseCode = "400", description = "Validation failed: a field-to-message map.",
                     content = @Content(schema = @Schema(type = "object"), examples = @ExampleObject(value = "{\"password\": \"Password is required\"}"))),
        @ApiResponse(responseCode = "401", description = "Wrong e-mail or password (empty body).", content = @Content)
    })
    @PostMapping("/login")
    public JwtResponse login(
        @Valid @RequestBody LoginRequest request,
        HttpServletResponse response) {

        var loginResult = authService.login(request);

        var refreshToken = loginResult.getRefreshToken().toString();
        var cookie = new Cookie("refreshToken", refreshToken);
        cookie.setHttpOnly(true);
        cookie.setPath("/auth/refresh");
        cookie.setMaxAge(jwtConfig.getRefreshTokenExpiration());
        cookie.setSecure(true);
        response.addCookie(cookie);

        return new JwtResponse(loginResult.getAccessToken().toString());
    }

    @Operation(summary = "Refresh the access token (public, cookie-based)",
               description = "Issues a new access token from the `refreshToken` cookie set by `POST /auth/login`. Browsers send the cookie automatically; other clients send `Cookie: refreshToken=...`. Swagger UI cannot attach a cookie scoped to another path, so try this one from a browser or curl.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "A new access token."),
        @ApiResponse(responseCode = "401", description = "Cookie missing, or the refresh token is invalid, expired, not a refresh token, or belongs to a deleted user (empty body).", content = @Content)
    })
    @PostMapping("/refresh")
    public JwtResponse refresh(
        @Parameter(description = "Refresh token cookie set by POST /auth/login; sent automatically by browsers.")
        @CookieValue(value = "refreshToken") String refreshToken) {
        var accessToken = authService.refreshAccessToken(refreshToken);
        return new JwtResponse(accessToken.toString());
    }

    @Operation(summary = "Get the current user",
               description = "Returns the account behind the access token.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The current user."),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "404", description = "The user behind the token no longer exists (empty body).", content = @Content)
    })
    @GetMapping("/me")
    public ResponseEntity<UserDto> me() {
        var user = authService.getCurrentUser();
        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        var userDto = userMapper.toDto(user);
        return ResponseEntity.ok(userDto);
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<Void> handleBadCredentialsException() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }
}
