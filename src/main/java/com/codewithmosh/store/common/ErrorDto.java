package com.codewithmosh.store.common;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;

// Beyond the course (API docs): schema description and example for Swagger UI.
@Schema(description = "Error body of most 4xx/5xx responses.")
@AllArgsConstructor
@Data
public class ErrorDto {
    @Schema(description = "Human-readable error message.", example = "Access denied.")
    private String error;
}
