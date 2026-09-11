package com.codewithmosh.store.admin;

import com.codewithmosh.store.common.ErrorDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Admin")
@RestController
@RequestMapping("/admin")
public class AdminController {
    @Operation(summary = "Admin smoke test (admin only)",
               description = "Returns a plain-text greeting; useful only to check that the access token carries the ADMIN role.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The greeting.",
                     content = @Content(mediaType = "text/plain", schema = @Schema(type = "string", example = "Hello Admin!"))),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is not an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Access denied.\"}")))
    })
    @GetMapping("/hello")
    public String sayHello() {
        return "Hello Admin!";
    }
}
